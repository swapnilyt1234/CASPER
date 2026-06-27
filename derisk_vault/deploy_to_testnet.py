import os
import asyncio
import requests
import time
import inspect
import pkgutil
import importlib
import re
from dotenv import load_dotenv

import pycspr

# ── Dynamic Version Support for Casper Types ────────────────────────
try:
    from pycspr.types.crypto import KeyAlgorithm
except ImportError:
    from pycspr.crypto import KeyAlgorithm

try:
    from pycspr.types.cl import CLV_String, CLV_Bool, CLV_Key
except ImportError:
    from pycspr.types import CLV_String, CLV_Bool, CLV_Key

TESTNET_RPC_URL = "https://node.testnet.casper.network/rpc"
REQUEST_TIMEOUT = 30


def probe_https_node(url: str) -> bool:
    try:
        r = requests.post(
            url,
            json={"jsonrpc": "2.0", "method": "info_get_status", "params": [], "id": 1},
            timeout=10,
        )
        return r.status_code == 200 and "result" in r.json()
    except Exception:
        return False


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

    if deploy_dict is None:
        raise RuntimeError("Could not serialise deploy — check pycspr version.")

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "account_put_deploy",
        "params": {"deploy": deploy_dict},
    }

    r = requests.post(
        rpc_url,
        json=payload,
        timeout=REQUEST_TIMEOUT,
        headers={"Content-Type": "application/json"},
    )
    data = r.json()

    if "error" in data:
        print("\n[!] RAW VALIDATOR PAYLOAD:", data)
        raise RuntimeError(f"RPC error {data['error'].get('code')}: {data['error'].get('message')}")

    return data["result"]["deploy_hash"]


def build_session_object(wasm_bytes, args_dict):
    MB_Class = None
    Arg_Class = None

    for name, obj in inspect.getmembers(pycspr.types, inspect.isclass):
        lname = name.lower()
        if "modulebytes" in lname:
            MB_Class = obj
        elif "argument" in lname and ("deploy" in lname or "named" in lname):
            Arg_Class = obj

    if not MB_Class or not Arg_Class:
        for _, modname, _ in pkgutil.walk_packages(pycspr.__path__, pycspr.__name__ + "."):
            try:
                mod = importlib.import_module(modname)
                for name, obj in inspect.getmembers(mod, inspect.isclass):
                    lname = name.lower()
                    if "modulebytes" in lname:
                        MB_Class = obj
                    elif "argument" in lname and ("deploy" in lname or "named" in lname):
                        Arg_Class = obj
            except Exception:
                pass

    if not MB_Class or not Arg_Class:
        raise RuntimeError("FATAL: Could not find Session or Argument classes in pycspr.")

    args_list = []
    for k, v in args_dict.items():
        try:
            args_list.append(Arg_Class(name=k, value=v))
        except TypeError:
            args_list.append(Arg_Class(k, v))

    for attempt in [
        lambda: MB_Class(module_bytes=wasm_bytes, args=args_list),
        lambda: MB_Class(module_bytes=wasm_bytes, arguments=args_list),
        lambda: MB_Class(wasm_bytes, args_list),
    ]:
        try:
            return attempt()
        except Exception:
            continue
            
    raise RuntimeError("FATAL: Failed to inject arguments.")


def build_casper_agent_key(keypair):
    """
    Surgically precise Casper Key builder.
    Forces PyCSPR to calculate the True Blake2b Account Hash dynamically.
    """
    import pycspr.crypto
    
    # 1. Grab the public key bytes
    acc_key = getattr(keypair, "account_key", None)
    if not acc_key:
        raise RuntimeError("FATAL: Could not extract account_key from wallet.")
        
    # 2. Force the crypto engine to calculate the hash
    true_account_hash = None
    try:
        true_account_hash = pycspr.crypto.get_account_hash(acc_key)
    except AttributeError:
        try:
            import pycspr.factory.accounts
            true_account_hash = pycspr.factory.accounts.get_account_hash(acc_key)
        except Exception:
            pass

    if not true_account_hash:
        raise RuntimeError("FATAL: PyCSPR crypto engine failed to hash the account.")

    # 3. Clean and format the byte array
    if isinstance(true_account_hash, str):
        true_account_hash = bytes.fromhex(true_account_hash.replace("account-hash-", ""))
        
    if len(true_account_hash) > 32:
        true_account_hash = true_account_hash[-32:]

    # 4. Format the enum for the network
    class DummyKeyType: value = 0
    k_type = getattr(pycspr.types.cl, 'CLV_KeyType', DummyKeyType)
    enum_val = getattr(k_type, 'ACCOUNT', DummyKeyType())
    
    return CLV_Key(identifier=true_account_hash, key_type=enum_val)


async def main():
    load_dotenv(dotenv_path="../.env")

    print("[*] Initialising Testnet Deployment...")

    if probe_https_node(TESTNET_RPC_URL):
        print(f"[*] Probing {TESTNET_RPC_URL} ... [+] ONLINE")
    else:
        print(f"[*] Probing {TESTNET_RPC_URL} ... [-] UNREACHABLE")
        return

    rpc_url = TESTNET_RPC_URL
    print(f"[*] Locked to: {rpc_url}\n")

    key_candidates = [
        "Account 4_secret_key.pem",
        "../Account 4_secret_key.pem",
        os.environ.get("HOST_SECRET_KEY_PATH"),
        os.environ.get("CONTAINER_SECRET_KEY_PATH"),
        "../secret_key.pem",
        "secret_key.pem",
    ]
    KEY_PATH = next((p for p in key_candidates if p and os.path.exists(p)), None)
    if not KEY_PATH:
        print("[-] Error: Could not find secret_key.pem.")
        return
        
    print(f"[*] Using Admin Key: {KEY_PATH}")

    WASM_PATH = "wasm/DeRiskVault.wasm"
    if not os.path.exists(WASM_PATH):
        print(f"[-] Error: Compiled WASM not found at {WASM_PATH}")
        return

    print(f"[*] WASM: {WASM_PATH}")

    try:
        keypair = pycspr.parse_private_key(KEY_PATH, KeyAlgorithm.SECP256K1.name)
        print("[+] Loaded Private Key.")
    except Exception as e:
        print(f"[-] Failed to load key: {e}")
        return

    with open(WASM_PATH, "rb") as f:
        wasm_bytes = f.read()

    print("[*] Resolving Casper Key type for Odra...")
    agent_casper_key = build_casper_agent_key(keypair)

    print("[*] Injecting Odra framework constructor arguments...")
    session_args = {
        "odra_cfg_package_hash_key_name": CLV_String("derisk_vault_master_v10"),
        "odra_cfg_allow_key_override": CLV_Bool(True),
        "odra_cfg_is_upgradable": CLV_Bool(True),
        "odra_cfg_is_upgrade": CLV_Bool(False),
        "agent": agent_casper_key
    }

    session = build_session_object(wasm_bytes, session_args)
    payment = pycspr.create_standard_payment(300 * (10 ** 9))

    print("\n[+] Signing and broadcasting (auto-retrying High-S signatures)...")
    hash_str = None

    for attempt in range(10):
        deploy_params = pycspr.create_deploy_parameters(
            account=keypair,
            chain_name="casper-test",
        )
        deploy = pycspr.create_deploy(deploy_params, payment, session)
        deploy.approve(keypair)

        try:
            hash_str = send_deploy_https(deploy, rpc_url)
            print(f"[+] Broadcasted on attempt {attempt + 1}!")
            print(f"[+] Deploy Hash : {hash_str}")
            print(f"[+] Track at   : https://testnet.cspr.live/deploy/{hash_str}")
            break

        except Exception as e:
            err = str(e).lower()
            if "invalid approval" in err or "high" in err:
                print(f"    -> [Attempt {attempt + 1}] High-S signature hit. Recalculating...")
                time.sleep(1)
                continue
            else:
                print(f"[-] Failed to broadcast: {e}")
                return

    if not hash_str:
        print("[-] Could not produce a valid signature after 10 attempts.")
        return

    print("\n[*] Polling for finality (up to 60 s)...")
    
    for poll in range(30):
        await asyncio.sleep(2)
        try:
            r = requests.post(rpc_url, json={"jsonrpc": "2.0", "id": 1, "method": "info_get_deploy", "params": {"deploy_hash": hash_str}}).text
            
            hashes = set(re.findall(r'(?:hash|package)-[0-9a-f]{64}', r))
            clean_hashes = [h for h in hashes if hash_str not in h]
            
            if clean_hashes:
                target_hash = clean_hashes[0]
                
                lines = []
                env_path = "../.env" if os.path.exists("../.env") else ".env"
                    
                if os.path.exists(env_path):
                    with open(env_path, "r") as f:
                        lines = [l for l in f.readlines() if "DERISK_CONTRACT_HASH" not in l]
                        
                with open(env_path, "w") as f:
                    f.writelines(lines)
                    f.write(f'\nDERISK_CONTRACT_HASH="{target_hash}"\n')

                print("\n" + "█"*60)
                print("✅ CONTRACT DEPLOYED & .ENV UPDATED!")
                print(f"   Target Hash: {target_hash}")
                print("█"*60 + "\n")
                return
                
        except Exception:
            pass

    print("\n[-] Polling timed out — deploy may still be processing.")
    print(f"    Check: https://testnet.cspr.live/deploy/{hash_str}")

if __name__ == "__main__":
    asyncio.run(main())