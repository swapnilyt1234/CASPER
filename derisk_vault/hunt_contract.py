import requests
import json

# Your Wallet Address
WALLET_ADDRESS = "0202797ba2de8aa925487e08c5872689be7c8c455bc190e3ab0dabf20a514eddb761"
RPC_URL = "https://node.testnet.casper.network/rpc"

payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "state_get_item",
    "params": {
        "state_root_hash": requests.post(RPC_URL, json={"jsonrpc":"2.0","method":"chain_get_state_root_hash","params":[],"id":1}).json()["result"]["state_root_hash"],
        "key": f"account-hash-{WALLET_ADDRESS[2:]}"
    }
}

response = requests.post(RPC_URL, json=payload).json()
print(json.dumps(response, indent=2))

