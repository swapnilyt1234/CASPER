import requests

DEPLOY_HASH = "6d9a408a7f2dd456c882052271a77e3b1c2d1e74c99ecd4684560260e3003b22"
RPC = "https://node.testnet.casper.network/rpc"

print("\n[*] Initializing Condor-Immune Autopsy...")

# Recursive search bypasses any JSON schema changes
def hunt_transforms(data):
    if isinstance(data, dict):
        if "transforms" in data: return data["transforms"]
        for v in data.values():
            res = hunt_transforms(v)
            if res: return res
    elif isinstance(data, list):
        for item in data:
            res = hunt_transforms(item)
            if res: return res
    return []

# Try Condor format first, fallback to legacy
payloads = [
    {"jsonrpc": "2.0", "id": 1, "method": "info_get_transaction", "params": {"transaction_hash": DEPLOY_HASH}},
    {"jsonrpc": "2.0", "id": 1, "method": "info_get_deploy", "params": {"deploy_hash": DEPLOY_HASH}}
]

transforms = []
for p in payloads:
    try:
        resp = requests.post(RPC, json=p).json()
        transforms = hunt_transforms(resp)
        if transforms: break
    except: pass

if not transforms:
    print("[-] Fatal: Could not extract transforms from the blockchain data.")
    exit()

print("\n" + "█"*70)
print("✅ CONDOR AUTOPSY: IDENTIFYING ALL SMART CONTRACT LOGIC")
print("█"*70)

found = False
for t in transforms:
    key = t.get("key", "")
    action = t.get("transform", {})
    action_type = list(action.keys())[0] if isinstance(action, dict) else str(action)
    
    # Looking for Contracts, Packages, and the new Condor Addressable Entities
    if any(k in action_type for k in ["Contract", "Entity", "Package"]):
        found = True
        print(f"🚨 {action_type.upper()} DETECTED:")
        print(f"   -> {key}\n")

if not found:
    print("[-] No contracts or entities found in the transaction effects.")
else:
    print("💡 THE FIX:")
    print("   Your ai_agent.py crashed earlier because it tried to execute a 'Package'.")
    print("   Look at the list above. Grab the hash for the CONTRACT or ENTITY (ignore the Package).")
    print("   Put THAT hash into your .env file, and run your agent one last time!")