# 🗂️ DeRisk — Project State Snapshot
> **Generated:** 2026-06-25 | **Status:** Active — Phase 1

---

## Overview

**DeRisk** is an autonomous, AI-driven DeFi insurance protocol built on the **Casper Network**. It uses a Python off-chain agent to monitor on-chain market conditions in real time, evaluate exploit risk via an LLM, and autonomously update smart contract premium rates. A Next.js dashboard provides a read-only UI for retail and agent activity.

---

## Repository Layout

```
caspermeow/
├── .agents/
│   └── ARCHITECTURE.md          # Canonical system constraints (authoritative)
├── derisk-agent/                # Off-chain Python risk agent (FastAPI)
├── derisk-web/                  # Next.js frontend dashboard
├── derisk_vault/                # Rust/Odra smart contract (Casper Network)
├── docker-compose.yml           # Multi-service orchestration
├── mcp_config.json              # MCP tool configuration
└── .env                         # Shared environment variables
```

---

## Layer 1 — Smart Contract (`derisk_vault/`)

| Item | Detail |
|---|---|
| **Language** | Rust |
| **Framework** | Odra `v2.8.0` |
| **Target Chain** | Casper Network (WASM) |
| **Contract Name** | `DeRiskVault` |
| **Version** | `0.1.0` (tagged `2026-06-23`) |

### Contract State (`src/derisk_vault.rs`)

| Storage Field | Type | Purpose |
|---|---|---|
| `current_premium_rate` | `Var<u8>` | Active insurance premium rate (%) |
| `halt_coverage` | `Var<bool>` | Emergency halt flag |
| `agent_address` | `Var<Address>` | Only address authorized to update params |
| `stakes` | `Mapping<Address, U512>` | Per-user deposit tracking |

### Entry Points

| Entry Point | Visibility | Description |
|---|---|---|
| `init(agent: Address)` | Constructor | Sets agent, initializes rate to `5%`, halt to `false` |
| `deposit()` | Public, payable | Accepts user stake in CSPR |
| `update_risk_params(new_rate, halt_coverage)` | Agent-only | Updates premium rate and halt flag |
| `get_premium_rate()` | Public, read-only | Returns current premium `u8` |

### Build Targets

- `derisk_vault_build_contract` — compiles WASM
- `derisk_vault_build_schema` — generates contract schema
- `derisk_vault_cli` — CLI utility for contract interaction

### Helper Scripts (`derisk_vault/`)

| Script | Purpose |
|---|---|
| `ai_agent.py` | Standalone AI agent: fetches CoinGecko CSPR data → decides risk params → broadcasts deploy to Casper Testnet (10-attempt retry with High-S signature handling) |
| `deploy_to_testnet.py` | Deploys the compiled WASM contract to testnet |
| `deposit.py` | Sends a deposit transaction to the live contract |
| `update_risk.py` | Manually triggers `update_risk_params` on-chain |
| `autopsy.py` | Post-mortem analysis script |
| `fix_vault.py` | Utility for vault state repair |
| `get_hash.py / get_my_hash.py` | Retrieves contract/deploy hash |
| `get_list.py / get_it.py` | Query contract state |
| `hunt_contract.py` | Scans for deployed contract |
| `get_wallet_keys.py` | Key management utility |
| `force_extract.py` | Force-extract utility |

### Test Coverage

- `test_initialization` — verifies default premium rate is `5%`
- `test_permissioned_update` — verifies agent can update, unauthorized callers are rejected

---

## Layer 2 — Off-Chain Agent (`derisk-agent/`)

| Item | Detail |
|---|---|
| **Runtime** | Python |
| **API Framework** | FastAPI + Uvicorn |
| **Port** | `5000` |
| **Data Source** | CSPR.cloud SSE Stream (via `CSPR_STREAM_URL` env var) |

### Python Dependencies

```
pandas, requests, sseclient-py
fastapi, uvicorn, pydantic
casper-python-sdk, python-dotenv
```

### Key Modules

| File | Role |
|---|---|
| `main.py` | FastAPI app entry point. Lifespan manages the background agent loop. Exposes `/ingest` and `/api/logs` endpoints. |
| `risk_evaluator.py` | `RiskEvaluator` class — evaluates inbound block/tx events, returns `risk_score` and `target_premium_rate` |
| `stream_listener.py` | SSE stream consumer for CSPR.cloud events |
| `x402_client.py` | Handles `402 Payment Required` responses — fulfils micropayments via Lightning/x402 protocol |
| `mock_stream.py` | Local mock SSE server (used for dev/testing) |
| `simulate_exploit.py` | Injects synthetic exploit events into the agent for testing |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest` | Accepts a block event JSON payload, runs `RiskEvaluator`, logs result. If `risk_score > 80` triggers x402 payment log + contract action log. |
| `GET` | `/api/logs` | Returns rolling buffer of last 50 log entries. |

### Agent Behaviour

1. On startup, connects to SSE stream URL.
2. Each incoming block event is passed to `RiskEvaluator`.
3. If risk score > 80, agent simulates x402 micropayment interception and logs a vault halt action.
4. Logs are exposed via REST for the frontend to poll.

### x402 Integration

- On `402 Payment Required` from external API, the agent parses `X-Payment` / `X-Payment-Receipt` headers.
- Fulfils micropayment non-blocking (async), logs: timestamp, endpoint, amount, receipt hash.
- Payment failure raises structured error and halts the affected validation step.

---

## Layer 3 — Web Frontend (`derisk-web/`)

| Item | Detail |
|---|---|
| **Framework** | Next.js `16.2.9` |
| **Language** | TypeScript |
| **React** | `19.2.4` |
| **Styling** | Tailwind CSS `v4` |
| **Port** | `3000` |
| **Version** | `0.1.0` |

### Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `framer-motion` | `^12.40.0` | Animations |
| `lucide-react` | `^1.21.0` | Icon library |
| `tailwindcss` | `^4` | Styling |

### Components (`src/components/`)

| Component | Purpose |
|---|---|
| `RetailTerminal.tsx` | Retail user interface — likely deposit/coverage view |
| `AgentTerminal.tsx` | Live agent activity feed — streams logs from `/api/logs` |
| `PremiumChart.tsx` | Visualizes premium rate history over time |
| `ErrorBoundary.tsx` | React error boundary for graceful failure handling |

### Pages (`src/app/`)

| File | Purpose |
|---|---|
| `page.tsx` | Main dashboard page |
| `layout.tsx` | Root layout (metadata, fonts) |
| `globals.css` | Global styles |

> **Constraint:** The frontend is strictly read-only. It never calls an LLM, never writes to the blockchain, and never directly mutates state. All data flows in from the agent's REST API or on-chain reads.

---

## Infrastructure (`docker-compose.yml`)

Three services, one network (`derisk-net`):

| Service | Image Source | Port | Depends On |
|---|---|---|---|
| `cspr-mock` | `derisk-agent/Dockerfile.mock` | `8080` | — |
| `derisk-agent` | `derisk-agent/Dockerfile` | `5000` | `cspr-mock` |
| `derisk-web` | `derisk-web/Dockerfile` | `3000` | `derisk-agent` |

**Volume mounts:**
- `./derisk_vault/target` → `/contracts/target` (compiled WASM accessible by agent)
- Host secret key PEM → container (read-only, for contract signing)

**Key env vars:**
- `CSPR_STREAM_URL` — SSE stream endpoint (defaults to mock in Docker)
- `CORS_ORIGIN` — Agent CORS whitelist
- `NEXT_PUBLIC_AGENT_API_URL` — Frontend → Agent API URL
- `DERISK_CONTRACT_HASH` — Deployed contract hash (set in `.env`)

---

## Architecture Constraints (from `.agents/ARCHITECTURE.md`)

> Status: **Active — Phase 1 constraints locked** (as of 2026-06-22)

1. **Smart contracts** — Rust/Odra only, Casper Network target.
2. **Off-chain agent** — Python only. No AI logic in frontend or contracts.
3. **Frontend** — Next.js web only. No mobile/native targets (React Native, Flutter, Electron etc. are **prohibited**).
4. **Data source** — CSPR.cloud Streaming API is the primary on-chain data feed.
5. **Payment protocol** — x402 only for external API consumption. No hard-coded credentials.
6. **Single writer** — Only the Python agent may call `update_risk_params` on the contract.
7. **Versioned interfaces** — API contracts between layers must be explicitly versioned.

---

## Known State / Notes

- `derisk_vault/CHANGELOG.md` records only `v0.1.0` — initial `flipper` module scaffolding. The vault contract has since been fully implemented.
- `derisk_vault/deploy_to_testnet.py.save` exists — likely an older save of the deploy script, can be cleaned up.
- Two PEM key files exist at the root (`Account 3_secret_key.pem`, `Account 4_secret_key.pem`) — the agent uses Account 4 by default.
- `binaryen-version_130-x86_64-linux.tar.gz` (~102 MB) is checked in to `derisk_vault/` — intended for WASM optimization tooling.
- `mcp_config.json` is present at root — MCP tool integrations configured for the project.
- `tests/` directory exists in `derisk-agent/` but contents not yet audited.
- `src/hooks/` directory exists in `derisk-web/` but contents not yet audited.

---

*Snapshot taken: 2026-06-25 | Conversation: `80092d34-2a0a-4ac4-aff5-6fb86ae6e08a`*
