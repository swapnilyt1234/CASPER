import os
import asyncio
import requests
import time
import re
import threading
from dotenv import load_dotenv
from http.server import BaseHTTPRequestHandler, HTTPServer

import pycspr
from pycspr.types.node.rpc import DeployOfStoredContractByHashVersioned, DeployArgument

try:
    from pycspr.types.crypto import KeyAlgorithm
except ImportError:
    from pycspr.crypto import KeyAlgorithm

try:
    from pycspr.types.cl import CLV_U8, CLV_Bool
except ImportError:
    from pycspr.types import CLV_U8, CLV_Bool

TESTNET_RPC_URL = os.getenv("RPC_NODE_URL", "https://node.testnet.casper.network/rpc")
REQUEST_TIMEOUT = 30

# ── 1. GLOBAL GAS-SAVING CACHE STATE ──────────────────────────────────
LAST_DEPLOYED_STATE = {"rate": None, "halt": None}

def analyze_market():
    print("\n[🧠] AI AGENT: Scanning global crypto markets...")
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd&include_24hr_change=true"
        headers = {}
        api_key = os.getenv("COINGECKO_API_KEY")
        if api_key:
            headers["x-cg-demo-api-key"] = api_key
            
        response = requests.get(url, headers=headers, timeout=10).json()
        casper_data = response.get("casper-network", {})
        
        # Pull live market data (Training wheels removed!)
        price_change_24h = casper_data.get("usd_24h_change", 0.0)
        
        print(f"[📊] AI AGENT: CSPR 24-Hour Price Change is {price_change_24h:.2f}%")
    except Exception as e:
        print(f"[-] AI AGENT: Could not reach market API ({e}). Defaulting to volatile market.")
        price_change_24h = -15.0

    if price_change_24h <= -20.0:
        print("[🚨] AI AGENT DECISION: Extreme Crash Detected! Halting all coverage.")
        return 15, True  # Rate jumps to 15%, Halt = True
    elif price_change_24h <= -10.0 or price_change_24h >= 10.0:
        print("[⚠️] AI AGENT DECISION: High Volatility Detected. Raising premiums.")
        return 15, False
    else:
        print("[✅] AI AGENT DECISION: Market is stable. Lowering premiums.")
        return 5, False

from datetime import datetime
import json
import os

def log_to_dashboard(deploy_hash, rate, halt_status):
    # IMPORTANT: Adjust 'derisk-dashboard' if your Next.js folder is named something else!
    log_path = "../derisk-dashboard/audit_logs.json" 
    
    try:
        if os.path.exists(log_path):
            with open(log_path, "r") as f:
                logs = json.load(f)
        else:
            logs = []
    except Exception:
        logs = []
        
    # Dynamically name the action based on the AI's decision
    action_name = "Emergency Liquidity Protocol Freeze" if halt_status else "Pre-emptive Volatility Adjustment"
    if rate == 5 and not halt_status:
        action_name = "System Param Optimization (Healed)"

    new_log = {
        "deployHash": deploy_hash,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "action": action_name,
        "rate": rate,
        "halted": halt_status,
        "status": "Success",
        "cost": "2.93 CSPR" 
    }
    
    # Insert at the top (newest first) and keep only the last 10 records
    logs.insert(0, new_log)
    logs = logs[:10]
    
    try:
        with open(log_path, "w") as f:
            json.dump(logs, f, indent=4)
        print("[📝] AI AGENT: Appended real transaction to Dashboard Audit Trail.")
    except Exception as e:
        print(f"[-] Could not write to dashboard log. Check folder path. ({e})")

def build_invocation_session(contract_hash_str, entry_point, args_dict):
    from pycspr.types.node.rpc import DeployOfStoredContractByHash, DeployArgument

    clean_hex = re.sub(r'[^0-9a-fA-F]', '', contract_hash_str)
    raw_hash_bytes = bytes.fromhex(clean_hex)

    args_list = []
    for k, v in args_dict.items():
        try:
            args_list.append(DeployArgument(name=k, value=v))
        except TypeError:
            args_list.append(DeployArgument(k, v))

    return DeployOfStoredContractByHash(
        args=args_list,
        entry_point=entry_point,
        hash=raw_hash_bytes
    )

async def main():
    global LAST_DEPLOYED_STATE
    load_dotenv(dotenv_path="../.env")
    new_rate, halt_status = analyze_market()

    # ── 2. STATE CACHE CHECK (Prevents Burning CSPR Tokens) ───────────
    if LAST_DEPLOYED_STATE["rate"] == new_rate and LAST_DEPLOYED_STATE["halt"] == halt_status:
        print("[😴] AI AGENT: Market state is identical to current contract parameters. Skipping deployment to save gas.")
        return

    KEY_PATH = os.getenv("PRIVATE_KEY_PATH", "./private_key.pem")
    if not os.path.exists(KEY_PATH):
        raise FileNotFoundError("Private key not found at specified path. If on Render, ensure Secret File is mounted correctly.")

    keypair = pycspr.parse_private_key(KEY_PATH, KeyAlgorithm.SECP256K1.name)
    contract_hash = os.environ.get("DERISK_CONTRACT_HASH")
    if not contract_hash:
        print("[-] Error: DERISK_CONTRACT_HASH missing from .env")
        return

    print(f"\n[*] AI AGENT: Formulating Blockchain Payload (Rate={new_rate}%, Halt={halt_status})...")

    session = build_invocation_session(contract_hash, "update_risk_params", {
        "new_rate": CLV_U8(new_rate),
        "halt_coverage": CLV_Bool(halt_status)
    })

    payment = pycspr.create_standard_payment(5 * (10 ** 9))
    print("[*] AI AGENT: Broadcasting to Casper Testnet...")

    for attempt in range(10):
        deploy_params = pycspr.create_deploy_parameters(account=keypair, chain_name="casper-test")
        deploy = pycspr.create_deploy(deploy_params, payment, session)
        deploy.approve(keypair)

        try:
            deploy_dict = None
            for method in [lambda: deploy.to_json(), lambda: pycspr.serialisation.to_json(deploy), lambda: pycspr.serializer.to_json(deploy)]:
                try:
                    deploy_dict = method()
                    break
                except Exception:
                    pass

            if not deploy_dict:
                raise RuntimeError("Failed to serialize deploy to JSON.")

            r = requests.post(TESTNET_RPC_URL, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "account_put_deploy",
                "params": {"deploy": deploy_dict},
            }, timeout=REQUEST_TIMEOUT, headers={"Content-Type": "application/json"})

            data = r.json()
            if "error" in data:
                raise RuntimeError(f"RPC {data['error'].get('code')}: {data['error'].get('message')} | {data['error'].get('data')}")

            hash_str = data["result"]["deploy_hash"]
            print(f"[+] AI AGENT: Command Accepted on attempt {attempt + 1}!")
            print(f"[+] Exec Hash : {hash_str}")
            
            # ── 1. UPDATE FRONTEND LOGS IMMEDIATELY ──
            log_to_dashboard(hash_str, new_rate, halt_status)
            
            # ── 2. STATE CACHE UPDATE ──
            LAST_DEPLOYED_STATE["rate"] = new_rate
            LAST_DEPLOYED_STATE["halt"] = halt_status
            
            # ── 3. HIBERNATE EARLY ──
            print("[*] AI AGENT: Transaction broadcasted successfully. Sentinel proceeding to hibernate...")
            return

        except Exception as e:
            err_msg = str(e).lower()
            if "invalid approval" in err_msg or "high" in err_msg:
                print(f"[*] High-S Signature, retrying (Attempt {attempt + 1}/10)...")
                time.sleep(1)
                continue
            else:
                print(f"\n[-] AI AGENT FATAL ERROR: {e}")
                return

    print("[-] Failed to broadcast after 10 attempts.")


import json

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/logs':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open('audit_logs.json', 'rb') as f:
                    self.wfile.write(f.read())
            except FileNotFoundError:
                self.wfile.write(b"[]")
        else:
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b"AI Sentinel is awake and monitoring.")

def keep_alive_server():
    # Render dynamically assigns a PORT environment variable
    port = int(os.environ.get('PORT', 8080))
    server = HTTPServer(('0.0.0.0', port), HealthCheckHandler)
    server.serve_forever()

# ── 4. 24/7 IMMORTAL SENTINEL WRAPPER ─────────────────────────────────
async def run_sentinel():
    print("\n[🚀] INITIALIZING DERISK Vault 24/7 SENTINEL...")
    
    # Start the dummy server in a background thread to satisfy Render's port requirement
    threading.Thread(target=keep_alive_server, daemon=True).start()
    
    while True:
        try:
            print("\n" + "="*60)
            print(f"[{datetime.utcnow().isoformat()}] [⏱️] Initiating scheduled market scan...")
            await main()
        except Exception as e:
            print(f"\n[💥] SENTINEL CRITICAL ERROR CAUGHT: {e}")
            print("[!] Agent infrastructure survived the exception. Rebooting for next cycle...")
            
        # 60 seconds = 1 Minute loop interval for cloud background worker
        sleep_seconds = 60 
        print(f"\n[{datetime.utcnow().isoformat()}] [⏳] Sentinel hibernating. Next dynamic inspection in {sleep_seconds} seconds.")
        await asyncio.sleep(sleep_seconds)


if __name__ == "__main__":
    asyncio.run(run_sentinel())