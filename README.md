# 🤖 HackSwarm: Multi-Agent Team Collaboration Platform

> **Hacktoberfest / Hackathon Multi-Agent Swarm Orchestrator**
> Powered by **MCP (Model Context Protocol)**, **LangChain**, **OpenHands**, **Aider**, and **Ollama**.

---

## 🎯 Project Vision
In high-stakes hackathons, teammates often suffer from code fragmentation, merge conflicts, and redundant work when using isolated AI coding assistants. 

**HackSwarm** solves this by establishing a **central coordination hub** hosted on the team's powerhouse laptop:
- **Unified Memory & State**: Centralized task backlog, vector search over project documentation, and live API schemas.
- **MCP Server Fabric**: Teammate AI agents communicate via standard Model Context Protocol tools (`claim_task`, `publish_contract`, `query_memory`, `broadcast_status`).
- **Flexible Execution Engines**: Developers choose between **OpenHands** (Docker-sandboxed autonomous refactors) and **Aider** (rapid terminal-based pair programming).
- **Local / Shared Compute**: Uses **Ollama** for embeddings and code intelligence over LAN/Tailscale.

---

## 👥 Roles & Governance
- **Project Manager (You)**: Backlog grooming, architecture guardrails, file lock approvals, and milestone sign-offs.
- **Teammate Developers (Clients)**: Feature implementers driving Aider or OpenHands in their assigned sub-domains.
- **LangChain Worker Agents**: Local automated copilots bridging teammate prompts with Central Hub MCP tools.
- **Central Coordinator**: Maintains state integrity, advisory file locks, and shared vector memory.

---

## 🏗️ Architecture Blueprint
For the comprehensive technical specification, visit the project architecture document:
👉 [Multi-Agent Hackathon Architecture Blueprint](file:///C:/Users/Mr%20Mud/.gemini/antigravity/brain/31a04a41-3d8c-4b51-8315-31042a3ecb56/multi_agent_hackathon_architecture.md)

### Hub-and-Spoke Topology
```text
           [ Host Node: Powerhouse Laptop ]
        ┌────────────────────────────────────┐
        │  • FastMCP Server (Port 8000)      │
        │  • SQLite Task DB & Advisory Locks │
        │  • ChromaDB Unified Vector Memory  │
        │  • Ollama (Qwen2.5-Coder / Nomic)  │
        └─────────────────┬──────────────────┘
                          │ LAN / Tailscale Mesh
       ┌──────────────────┴──────────────────┐
       │                                     │
[ Teammate 1: Frontend ]            [ Teammate 2: Backend ]
 ├── LangChain MCP Client            ├── LangChain MCP Client
 ├── Aider CLI (Local Git)           ├── OpenHands Docker Sandbox
 └── Local Codebase                  └── Local Codebase
```

---

## 📁 Repository Structure
```text
ai-hacktoberfest-project/
├── .env.example                # Template for network IPs, ports, and models
├── README.md                   # This overview
├── opencode.json               # OpenCode CLI configuration with MCP integration
├── central_hub/                # Deployed on the powerhouse laptop
│   ├── mcp_server/             # FastMCP server & custom tool definitions
│   ├── llm_router/             # Smart cascading Free-LLM router (free-llm.com)
│   │   ├── provider_registry.py# Metadata, models & rate-limits for Groq, Gemini, Mistral, etc.
│   │   └── smart_router.py     # Automated failover & cascading fallback engine
│   ├── database/               # Relational task store & lock manager
│   ├── memory/                 # Vector memory for docs & code contracts
│   └── dashboard/              # Streamlit / Web UI for the Project Manager
├── teammate_client/            # Cloned onto teammate machines
│   ├── client_agent.py         # LangChain agent communicating with MCP Hub
│   ├── opencode_runner.py      # OpenCode CLI runner with MCP & OPENCODE_API_KEY
│   ├── aider_runner.py         # Zero-cost Aider launcher (Groq/Gemini/Mistral/Ollama)
│   └── openhands_runner.py     # Dispatches sandboxed tasks to OpenHands Docker
└── shared_contracts/           # Shared OpenAPI specs and Pydantic/TS schemas
```

---

## ⚡ Zero-Cost LLM Providers (from [free-llm.com](https://free-llm.com))

The system comes pre-configured with a **cascading smart fallback router** that leverages the top permanent free tiers (no credit cards required):
1. **Groq** (`llama-3.3-70b-versatile` / `qwen-2.5-coder-32b`) - 30 RPM, 14,400 req/day
2. **Google AI Studio** (`gemini-2.0-flash`) - 1M token context, 1,500 req/day
3. **Mistral** (`codestral-latest`) - Specialized code generation in 80+ languages
4. **OpenRouter Free** (`deepseek/deepseek-r1:free`, `meta-llama/llama-3.3-70b:free`)
5. **NVIDIA NIM** (`meta/llama-3.3-70b-instruct`) - 1,000 free requests
6. **Local Ollama** (`qwen2.5:7b-instruct`) - 100% offline, tuned for GTX 1660 6GB VRAM (~4.5GB VRAM usage, zero RAM spillover)

> **💡 Host Hardware Tip (GTX 1660 6GB VRAM)**:
> Pull the model before running offline:
> ```bash
> ollama pull qwen2.5:7b-instruct
> ollama pull nomic-embed-text
> ```

---

## Phone dispatch

The live console is a mobile browser, not the desk visualizer. The PC stays on and runs the hub. The phone joins the same Tailscale tailnet and opens `http://<pc-tailscale-ip>:3000`. Do not port-forward the hub.

Grok in Cursor stays the desk coding agent. The phone talks to this open stack: FastAPI, SQLite, and Aider. A 3060 laptop can serve Ollama (`qwen2.5:7b-instruct`) if you point `OLLAMA_BASE_URL` at it. The console does not need that GPU.

```powershell
pip install -r requirements.txt
# set CONSOLE_PIN in .env first
python -m uvicorn central_hub.api.app:app --host 0.0.0.0 --port 8787
cd apps/console
npm install
npm run dev
```

Sign in with the PIN. Settings has three allowance levels: Watch, Routine, and Open. Routine edits locked files on its own and waits before a commit, a delete, or an install. Push and secret files never run from the phone. A gate with no answer stays pending.

The diagram in `central_hub/dashboard/visualizer.html` is a desk simulation.

## 🚀 Quickstart Guide

### 1. Launch Aider with Any Free Provider
```bash
# Using Groq (Ultra fast)
python -m teammate_client.aider_runner --provider groq api/auth.py

# Using Google Gemini 2.0 Flash (Huge context)
python -m teammate_client.aider_runner --provider gemini

# Using Mistral Codestral (Targeted code generation)
python -m teammate_client.aider_runner --provider mistral

# Using Central Powerhouse Ollama (Offline)
python -m teammate_client.aider_runner --provider ollama
```

### 2. Launch OpenCode CLI (with MCP & OPENCODE_API_KEY)
```bash
# 1. Install OpenCode CLI globally (Windows / Mac / Linux)
npm install -g opencode-ai

# 2. Run OpenCode with HackSwarm MCP integration
python -m teammate_client.opencode_runner api/auth.py

# 3. Or launch directly using the native CLI (reads opencode.json automatically)
opencode api/auth.py
```

### 3. Launch OpenHands Docker Sandbox with Free LLM
```bash
python -m teammate_client.openhands_runner --provider gemini --task "Build user authentication API"
```

### 4. Run the Smart Router with Automatic Fallback
```bash
python central_hub/llm_router/smart_router.py
```

