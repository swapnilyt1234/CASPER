import requests

RPC_URL = "https://node.testnet.casper.network/rpc"
# This is the exact Account Hash for your Account 4 that you provided earlier
ACCOUNT_HASH = "account-hash-797ba2de8aa925487e08c5872689be7c8c455bc190e3ab0dabf20a514eddb761"

def extract_contract():
    print("[*] Connecting to Casper Testnet...")
    
    # 1. Get the current state root hash (the "now" timestamp of the network)
    root_res = requests.post(RPC_URL, json={
        "jsonrpc": "2.0", "id": 1, "method": "chain_get_state_root_hash"
    }).json()
    state_root = root_res["result"]["state_root_hash"]

    print("[*] Opening Account 4 wallet data...")
    
    # 2. Query your wallet's internal storage
    account_res = requests.post(RPC_URL, json={
        "jsonrpc": "2.0", "id": 1, "method": "state_get_item",
        "params": {
            "state_root_hash": state_root,
            "key": ACCOUNT_HASH,
            "path": []
        }
    }).json()

    try:
        named_keys = account_res["result"]["stored_value"]["Account"]["named_keys"]
        found = False
        
        print("\n[+] FOUND YOUR CONTRACT(S):")
        for key in named_keys:
            # Look for the exact name we injected via Odra
            if "derisk_vault" in key["name"]:
                print(f"    Name: {key['name']}")
                print(f"    Hash: {key['key']}\n")
                found = True
                
        if not found:
            print("[-] Could not find 'derisk_vault' in your wallet's saved keys.")
            print("    Raw keys found:", [k['name'] for k in named_keys])
            
    except Exception as e:
        print(f"[-] Failed to read wallet state: {e}")

if __name__ == "__main__":
    extract_contract()
