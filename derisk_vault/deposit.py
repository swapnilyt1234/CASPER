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
    from pycspr.types.cl import CLV_U512
except ImportError:
    from pycspr.types import CLV_U512

TESTNET_RPC_URL = "https://node.testnet.casper.network/rpc"
REQUEST_TIMEOUT = 30


def build_invocation_session(contract_hash_str, entry_point, args_dict):
    """The Absolute Brute-Force Injector."""
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

    raw_hash_bytes = bytes.fromhex(contract_hash_str.replace("hash-", ""))
    hex_string = contract_hash_str.replace("hash-", "")
    
    errors = []

    for SC_Class in SC_Candidates:
        for h_val in [raw_hash_bytes, hex_string]:
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
    print("\n[*] Initialising Customer Deposit...")

    # For testing, we are using your same secret_key.pem. 
    # In production, this would be the actual user's Web3 wallet.
    key_candidates = ["../secret_key.pem", "secret_key.pem"]
    KEY_PATH = next((p for p in key_candidates if p and os.path.exists(p)), None)
    if not KEY_PATH:
        print("[-] Error: Could not find user secret_key.pem.")
        return

    try:
        keypair = pycspr.parse_private_key(KEY_PATH, KeyAlgorithm.SECP256K1.name)
        print("[+] Customer Wallet Loaded.")
    except Exception as e:
        print(f"[-] Failed to load key: {e}")
        return

    contract_hash = os.environ.get("DERISK_CONTRACT_HASH")
    if not contract_hash:
        print("[-] Error: DERISK_CONTRACT_HASH not found in .env file.")
        return

    print(f"[*] Target Vault locked: {contract_hash[:15]}...")

    # ── YOUR RUST ENTRY POINT & ARGUMENTS ──
    # We assume your Rust function is named "deposit" and takes an "amount" argument.
    # We are simulating a deposit of 100 CSPR (100 * 10^9 motes)
    deposit_amount_motes = 100 * (10 ** 9)
    print(f"[*] Formulating deposit of 100 CSPR...")
    
    exec_args = {
        "amount": CLV_U512(deposit_amount_motes)
    }

    # Build the session targeting the "deposit" function
    session = build_invocation_session(contract_hash, "deposit", exec_args)
    
    # Standard gas payment for the transaction
    payment = pycspr.create_standard_payment(500 * (10 ** 9))

    print("\n[+] Signing and broadcasting deposit...")
    hash_str = None

    for attempt in range(10):
        deploy_params = pycspr.create_deploy_parameters(account=keypair, chain_name="casper-test")
        deploy = pycspr.create_deploy(deploy_params, payment, session)
        deploy.approve(keypair)

        try:
            hash_str = send_deploy_https(deploy, TESTNET_RPC_URL)
            print(f"[+] Deposit Accepted by network on attempt {attempt + 1}!")
            print(f"[+] Exec Hash : {hash_str}")
            break
        except Exception as e:
            err = str(e).lower()
            if "invalid approval" in err or "high" in err:
                # Silently auto-retrying High-S signatures
                time.sleep(1)
                continue
            else:
                return

    if not hash_str:
        return

    print("\n[*] Polling for deposit finality (up to 30 s)...")
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
                    print("\n[💸] SUCCESS! Funds deposited securely into the Vault.")
                    return
                elif "Failure" in result_data:
                    print(f"\n[-] Deposit reverted by smart contract: {result_data['Failure']['error_message']}")
                    return
        except Exception:
            pass

    print("\n[-] Polling timed out. Check explorer for final state.")


if __name__ == "__main__":
    asyncio.run(main())