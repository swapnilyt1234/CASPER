import sys
import requests

TESTNET_RPC_URL = "https://node.testnet.casper.network/rpc"

def get_contract_hash(deploy_hash):
    print(f"[*] Querying Casper Testnet for Deploy: {deploy_hash}...")
    
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "info_get_deploy",
        "params": {"deploy_hash": deploy_hash},
    }

    try:
        response = requests.post(TESTNET_RPC_URL, json=payload, timeout=15).json()
        
        if "error" in response:
            print(f"[-] RPC Error: {response['error'].get('message')}")
            return

        result = response.get("result", {})
        exec_results = result.get("execution_results", [])
        
        if not exec_results:
            print("[-] No execution results found. The block might still be processing. Wait 10 seconds and try again.")
            return

        execution_result = exec_results[0]["result"]
        
        if "Success" in execution_result:
            transforms = execution_result["Success"]["effect"]["transforms"]
            for effect in transforms:
                if effect.get("transform") == "WriteContract":
                    contract_hash = effect["key"]
                    print("\n" + "="*60)
                    print(f"[+] SUCCESS! Found your V2 Contract Hash:")
                    print(f"{contract_hash}")
                    print("="*60)
                    print("-> Copy this value into your .env file as DERISK_CONTRACT_HASH")
                    return
            print("[-] Transaction succeeded, but no 'WriteContract' event was found in the transforms.")
        elif "Failure" in execution_result:
            print(f"[-] Deploy failed on-chain: {execution_result['Failure']['error_message']}")
            
    except Exception as e:
        print(f"[-] Connection or parsing error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 get_hash.py <DEPLOY_HASH>")
    else:
        # Strip any accidental whitespace or quotes
        clean_hash = sys.argv[1].strip("'\" ")
        get_contract_hash(clean_hash)