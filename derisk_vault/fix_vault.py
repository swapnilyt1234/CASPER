import os
import requests
import pycspr

# Dynamic import fallback
try:
    from pycspr.types.crypto import KeyAlgorithm
except ImportError:
    from pycspr.crypto import KeyAlgorithm

RPC = "https://node.testnet.casper.network/rpc"
print("\n[*] Interrogating Blockchain State...")

# 1. Identity Verification
KEY = "../secret_key.pem" if os.path.exists("../secret_key.pem") else "secret_key.pem"
kp = pycspr.parse_private_key(KEY, KeyAlgorithm.SECP256K1.name)
raw = getattr(kp, "account_key", getattr(kp, "account_hash", None))
acc_hex = raw[-32:].hex() if isinstance(raw, bytes) else raw.hex()[-64:]

# 2. Query Account State
srh = requests.post(RPC, json={"jsonrpc":"2.0","method":"chain_get_state_root_hash","params":[],"id":1}).json()["result"]["state_root_hash"]
acc_res = requests.post(RPC, json={"jsonrpc":"2.0","method":"state_get_item","params":{"state_root_hash":srh,"key":f"account-hash-{acc_hex}"},"id":1}).json()

val = acc_res.get("result", {}).get("stored_value", {})
keys = val.get("Account", val.get("AddressableEntity", {})).get("named_keys", [])

# Find the vault
vaults = [k for k in keys if "derisk" in k["name"].lower()]
if not vaults:
    print("[-] Fatal: No derisk vault found in your wallet's named keys.")
    exit()

latest = sorted(vaults, key=lambda x: x["name"])[-1]
print(f"[*] Package Hash Found: {latest['key']}")

# 3. Dig into Package for the True Contract Hash
pkg_res = requests.post(RPC, json={"jsonrpc":"2.0","method":"state_get_item","params":{"state_root_hash":srh,"key":latest["key"]},"id":1}).json()
pval = pkg_res.get("result", {}).get("stored_value", {})

try:
    pkg = pval.get("ContractPackage", pval.get("EntityPackage", {}))
    versions = pkg.get("versions", [])
    
    # Extract the actual contract hash from the latest version
    target = versions[-1]
    true_hash = target.get("contract_hash", target.get("addressable_entity_hash", latest["key"]))
    
    print(f"[+] TRUTH EXTRACTED! Contract Hash: {true_hash}")
    
    # 4. Auto-Inject into .env
    lines = []
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            lines = [l for l in f.readlines() if "DERISK_CONTRACT_HASH" not in l]
            
    with open(".env", "w") as f:
        f.writelines(lines)
        f.write(f'\nDERISK_CONTRACT_HASH="{true_hash}"\n')
        
    print("\n" + "█"*60)
    print("✅ VAULT SECURED & .ENV UPDATED")
    print("█"*60 + "\n")
except Exception as e:
    print(f"[-] Parsing error: {e}")
