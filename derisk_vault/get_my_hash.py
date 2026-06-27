import requests

DEPLOY_HASH = "0ed235e86f433158380c1279231af619a9e85446e02a5fe87ef5a55f669fdf15"
RPC_URL = "https://node.testnet.casper.network/rpc"

print(f"[*] Ripping contract hash from deploy: {DEPLOY_HASH[:8]}...")

payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "info_get_deploy",
    "params": {"deploy_hash": DEPLOY_HASH}
}

try:
    response = requests.post(RPC_URL, json=payload).json()
    
    results = response.get("result", {}).get("execution_results", [])
    if not results:
        print("\n[-] FATAL: The network completely dropped this transaction. It does not exist.")
        exit()
        
    success_data = results[0].get("result", {}).get("Success")
    if not success_data:
        print("\n[-] FATAL: Deploy failed on-chain. Error details:")
        print(results[0].get("result", {}).get("Failure", "Unknown Error"))
        exit()
        
    transforms = success_data.get("effect", {}).get("transforms", [])
    for effect in transforms:
        if effect.get("transform") == "WriteContract":
            print("\n" + "█"*60)
            print("✅ BOOM! HERE IS YOUR CONTRACT HASH:")
            print(f"\n{effect['key']}\n")
            print("█"*60)
            print("\nNEXT STEPS:")
            print("1. Copy the hash above.")
            print("2. Type: nano .env")
            print('3. Paste it as: DERISK_CONTRACT_HASH="hash-..."')
            print("4. Save and run: python3 ai_agent.py\n")
            exit()
            
    print("\n[-] Transaction succeeded, but no contract was written.")
except Exception as e:
    print(f"\n[-] Error making request: {e}")