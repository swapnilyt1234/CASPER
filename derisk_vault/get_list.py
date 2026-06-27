import requests
import re

TX = "6d9a408a7f2dd456c882052271a77e3b1c2d1e74c99ecd4684560260e3003b22"
RPC = "https://node.testnet.casper.network/rpc"

print("[*] Ripping raw hash list from blockchain...")

hashes = set()
for method in ["info_get_transaction", "info_get_deploy"]:
    try:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {("transaction_hash" if "transaction" in method else "deploy_hash"): TX}}
        r = requests.post(RPC, json=payload).text
        # Regex to catch any standard Casper Condor prefix
        hashes.update(re.findall(r'(?:hash|entity|contract|package)-[0-9a-f]{64}', r))
    except:
        pass

# Clean out background noise and the transaction hash itself
clean = sorted([h for h in hashes if TX not in h and "account-" not in h])

if not clean:
    print("[-] Failed to find hashes. The RPC node might be throttling.")
    exit()

print("\n" + "█"*60)
print("✅ REPLACE THE ARRAY IN ai_agent.py WITH THIS:")
print("█"*60 + "\n")
print("DEPLOYED_HASHES = [")
for i, h in enumerate(clean):
    comma = "," if i < len(clean) - 1 else ""
    print(f'    "{h}"{comma}')
print("]\n")
