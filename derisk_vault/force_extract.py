import requests
import re

print("[*] Ripping contract hash directly from the blockchain...")

# Your exact successful deploy hash
payload = {
    "jsonrpc": "2.0", 
    "id": 1, 
    "method": "info_get_deploy",
    "params": {"deploy_hash": "17b98700a2c7554d23fc78b7dbb7b8add8765ecd8abf6edaad3f4cb8829ffb9b"}
}

# Ask the node for the data, but convert it straight to raw text instead of JSON
raw_text = requests.post("https://node.testnet.casper.network/rpc", json=payload).text

# Use Regex to hunt down exactly what we need: "hash-" followed by 64 hex characters
found_hashes = set(re.findall(r'hash-[0-9a-f]{64}', raw_text))

if found_hashes:
    print("\n[+] SUCCESS! Copy the exact line below into your .env file:\n")
    for h in found_hashes:
        print(f'DERISK_CONTRACT_HASH="{h}"')
    print("")
else:
    print("[-] It's hiding. We need to deploy one more time.")