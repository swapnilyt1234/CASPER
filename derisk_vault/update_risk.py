import os
import asyncio
import requests
import time
import inspect
import pkgutil
import importlib
from dotenv import load_dotenv

import pycspr

# ── Dynamic Version Support ────────────────────────
try:
    from pycspr.types.crypto import KeyAlgorithm
except ImportError:
    from pycspr.crypto import KeyAlgorithm

try:
    from pycspr.types.cl import CLV_U8, CLV_Bool
except ImportError:
    from pycspr.types import CLV_U8, CLV_Bool

TESTNET_RPC_URL = "https://node.testnet.casper.network/rpc"
REQUEST_TIMEOUT = 30

# The exact components ripped from your deploy
DEPLOYED_HASHES = [
    "hash-096213ec9a10443029f61f42dca510927776af07ebbd3543e94e0decde94bbcc",
    "hash-797ba2de8aa925487e08c5872689be7c8c455bc190e3ab0dabf20a514eddb761",
    "hash-91e2046cd226e9d7106a170f63d9e313f764d470ee99df2bb88ad99581e5e7aa",
    "hash-ba51d590aafeed64f733a69a09d30ccb08c0e7004fae695e1cbeb1affd86a0fd",
    "hash-db24412705c5b1741f0b0adf943805f08b62728b2ac8233da4a2e830f6513c46",
]

def auto_discover_contract():
    print("[*] Scanning network to isolate the executable Contract...")
    root_res = requests.post(TESTNET_RPC_URL, json={
        "jsonrpc": "2.0", "id": 1, "method": "chain_get_state_root_hash"
    }).json()
    state_root = root_res["result"]["state_root_hash"]

    for h in DEPLOYED_HASHES:
        res = requests.post(TESTNET_RPC_URL, json={
            "jsonrpc": "2.0", "id": 1, "method": "state_get_item",
            "params": {"state_root_hash": state_root, "key": h}
        }).json()
        
        if "result" in res and "stored_value" in res["result"]:
            if "Contract" in res["result"]["stored_value"]:
                print(f"[+] Target locked! Contract found at: {h}")
                return h
                
    raise RuntimeError("FATAL: Could not isolate the Contract hash.")


def build_invocation_session(contract_hash_str, entry_point, args_dict):
    """
    Absolute Brute-Force Injector: 
    Tests every class candidate, every hash format, and every parameter permutation.
    """
    SC_Candidates = []
    Arg_Class = None

    for _, modname, _ in pkgutil.walk_packages(pycspr.__path__, pycspr.__name__ + "."):
        try:
            mod = importlib.import_module(modname)
            for name, obj in inspect.getmembers(mod, inspect.isclass):
                lname = name.lower()
                if "storedcontractbyhash" in lname:
                    if obj not in SC_Candidates:
                        SC_Candidates.append(obj)
                elif "argument" in lname and ("deploy" in lname or "named" in lname):
                    Arg_Class = obj
        except Exception:
            pass

    if not SC_Candidates or not Arg_Class:
        raise RuntimeError("FATAL: Could not find Session or Argument classes in pycspr.")

    args_list = []
    for k, v in args_dict.items():
        try:
            args_list.append(Arg_Class(name=k, value=v))
        except TypeError:
            args_list.append(Arg_Class(k, v))

    # Test both possible hash formats the SDK might demand
    raw_hash_bytes = bytes.fromhex(contract_hash_str.replace("hash-", ""))
    hex_string = contract_hash_str.replace("hash-", "")
    
    errors = []

    # Ruthlessly iterate through every candidate and combination
    for SC_Class in SC_Candidates:
        for h_val in [raw_hash_bytes, hex_string]:
            
            # ATTEMPT 1: Dynamic Keyword Arguments
            try:
                sig = inspect.signature(SC_Class.__init__)
                kwargs = {}
                for p in sig.parameters:
                    if p == 'self': continue
                    pl = p.lower()
                    if "hash" in pl or "id" in pl: kwargs[p] = h_val
                    elif "entry" in pl or "point" in pl or "name" in pl: kwargs[p] = entry_point
                    elif "arg" in pl: kwargs[p] = args_list
                return SC_Class(**kwargs)
            except Exception as e:
                errors.append(f"{SC_Class.__name__} kwargs error: {str(e)}")

            # ATTEMPT 2: Pure Positional Arguments
            try:
                return SC_Class(h_val, entry_point, args_list)
            except Exception as e:
                errors.append(f"{SC_Class.__name__} pos error: {str(e)}")

    raise RuntimeError(f"FATAL: All SC_Class combinations completely failed.\nDump: {errors}")


def send_deploy_https(deploy, rpc_url: str) -> str:
    deploy_dict = None
    for method in [
        lambda: deploy.to_json(),
        lambda: pycspr.serialisation.to_json(deploy),
        lambda: pycspr.serializer.to_json(deploy),
    ]:
        try:
            deploy_dict = method()
            break
        except Exception:
            continue

    payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "account_put_deploy",
        "params": {"deploy": deploy_dict},
    }

    r = requests.post(
        rpc_url, json=payload, timeout=REQUEST_TIMEOUT, headers={"Content-Type": "application/json"},
    )
    data = r.json()

    if "error" in data:
        print("\n[!] RAW VALIDATOR PAYLOAD:", data)
        raise RuntimeError(f"RPC error {data['error'].get('code')}: {data['error'].get('message')}")

    return data["result"]["deploy_hash"]


async def main():
    load_dotenv(dotenv_path="../.env")
    print("\n[*] Initialising DeRisk Admin Command...")

    key_candidates = ["../secret_key.pem", "secret_key.pem"]
    KEY_PATH = next((p for p in key_candidates if p and os.path.exists(p)), None)
    if not KEY_PATH:
        print("[-] Error: Could not find Account 4 secret_key.pem.")
        return

    try:
        keypair = pycspr.parse_private_key(KEY_PATH, KeyAlgorithm.SECP256K1.name)
        print("[+] Admin Wallet Loaded.")
    except Exception as e:
        print(f"[-] Failed to load key: {e}")
        return

    contract_hash = auto_discover_contract()

    print("[*] Formulating state change: new_rate=15, halt_coverage=True...")
    exec_args = {
        "new_rate": CLV_U8(15),
        "halt_coverage": CLV_Bool(True)
    }

    session = build_invocation_session(contract_hash, "update_risk_params", exec_args)
    payment = pycspr.create_standard_payment(300 * (10 ** 9))

    print("\n[+] Signing and broadcasting command...")
    hash_str = None

    for attempt in range(10):
        deploy_params = pycspr.create_deploy_parameters(account=keypair, chain_name="casper-test")
        deploy = pycspr.create_deploy(deploy_params, payment, session)
        deploy.approve(keypair)

        try:
            hash_str = send_deploy_https(deploy, TESTNET_RPC_URL)
            print(f"[+] Command Accepted on attempt {attempt + 1}!")
            print(f"[+] Exec Hash : {hash_str}")
            break
        except Exception as e:
            err = str(e).lower()
            if "invalid approval" in err or "high" in err:
                time.sleep(1)
                continue
            else:
                return

    if not hash_str:
        return

    print("\n[*] Polling for execution finality (up to 30 s)...")
    for poll in range(15):
        await asyncio.sleep(2)
        try:
            response = requests.post(TESTNET_RPC_URL, json={
                "jsonrpc": "2.0", "id": 1, "method": "info_get_deploy", "params": {"deploy_hash": hash_str},
            }, timeout=REQUEST_TIMEOUT).json()

            exec_results = response.get("result", {}).get("execution_results", [])
            if exec_results:
                result_data = exec_results[0]["result"]
                if "Success" in result_data:
                    print("\n[🚀] SUCCESS! Risk parameters permanently updated on-chain.")
                    return
                elif "Failure" in result_data:
                    print(f"\n[-] Execution reverted by smart contract: {result_data['Failure']['error_message']}")
                    return
        except Exception:
            pass

    print("\n[-] Polling timed out. Check explorer for final state.")


if __name__ == "__main__":
    asyncio.run(main())