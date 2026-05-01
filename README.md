# Nexus Alpha

**Nexus Alpha** is an AI-native developer IDE and autonomous orchestration engine built directly in the browser. Powered by React, TypeScript, and Vite, it integrates full-stack generative capabilities with durable workflows, real-time collaborative editing, an embedded terminal, and a sophisticated vector database integration. With Google Gemini as its core reasoning engine, it transitions from a simple dashboard into a comprehensive, multi-modal development environment.

***

## Core Features

- **AI-Native IDE Experience** — Includes a Monaco-based browser editor (`@monaco-editor/react`), real-time collaborative editing via Yjs (CRDTs), and an embedded full terminal (`xterm.js`).
- **Cheetah V3 Autocoder** — State-of-the-art Python-based code generation engine bridged with a TypeScript-native fallback for autonomous architectural expansion and multi-file synthesis.
- **Durable Workflows** — Powered by Temporal.io (`@temporalio/client`, `worker`, `workflow`) for resilient, long-running asynchronous orchestration.
- **Job Queues & Resiliency** — Utilizes BullMQ (Redis-backed) for pipeline execution and Opossum for robust circuit-breaker patterns across external API calls.
- **Advanced LLM Orchestration** — Integrates LangChain, LangChain Community, and LangChain OpenAI for complex, multi-agent reasoning chains.
- **Local Embedded RAG** — Leverages Qdrant as a vector database and Xenova Transformers for in-browser local embeddings, ensuring highly relevant generation context.
- **Hono Backend Platform** — High-performance backend routing built on Hono, featuring strict rate-limiting, JWT/API Key dual-authentication, and robust proxy safeguards.
- **Multi-Provider CLI** — Switch between OpenCode, OpenRouter, and DeepSeek providers seamlessly from within the app.
- **Self-Healing Loop** — Autonomous auto-fix loops with strict security gating (`NEXUS_ALLOW_AUTO_FIX`), granular RCE command allowlists, and atomic fix-history management.
- **Desktop Ready** — Pre-configured Electron build target for native desktop deployment.

***

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 6 |
| Editor & Terminal | Monaco Editor, Yjs (CRDTs), xterm.js |
| State & UI | Zustand, Motion, Recharts, Lucide React |
| Backend Core | **Hono**, Express (Legacy Adapter), WebSocket (`ws`) |
| Workflows & Queues | Temporal.io, BullMQ |
| Autocoder | **Overlay Cheetah V3** (Python/Jinja2 + TS Fallback) |
| AI / LLMs | Google Gemini (`@google/genai`), LangChain, Transformers.js |
| Vector DB (RAG) | Qdrant (`@qdrant/js-client-rest`) |
| Resiliency & Ops | Opossum (Circuit Breaker), Pino (Logging) |
| Code Quality | Biome (Linter/Formatter) |
| Database/Auth | Supabase |
| Testing / Desktop | Playwright / Electron |

***

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Google Gemini API key** (required) — get one at [ai.google.dev](https://ai.google.dev)
- Redis server (required for BullMQ)
- Temporal local server (optional, required for durable workflows)
- Python 3.9+ (optional, required only for native Cheetah V3 generation)

***

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/tap919/Nexus-Alpha.git
cd Nexus-Alpha
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values. At minimum, set `GEMINI_API_KEY` and `NEXUS_API_KEY`.

### 4. Start the development servers

**Frontend (Vite):**
```bash
npm run dev
```
Runs at [http://localhost:3000](http://localhost:3000)

**Backend (Hono + WebSocket):**
```bash
npm run server
```

**MCP Server:**
```bash
npm run mcp
```

***

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Google Gemini API key for all AI features |
| `NEXUS_API_KEY` | ✅ Yes | Server-to-server API authentication key (required in production) |
| `NEXUS_ALLOW_AUTO_FIX` | Optional | Set to `true` to enable unsandboxed destructive pipeline operations |
| `GITHUB_TOKEN` | Optional | GitHub PAT for live repo data and workflow triggers (repo + workflow scopes) |
| `OPENROUTER_API_KEY` | Optional | OpenRouter key for multi-model CLI provider |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek key for CLI provider |
| `SUPABASE_URL` | Optional | Supabase project URL for auth |
| `SUPABASE_ANON_KEY` | Optional | Supabase anon key for auth |
| `PORT` | Optional | HTTP server port (default: `3002`) |
| `MAX_WS_CLIENTS` | Optional | Connection cap for WebSocket server |

> ⚠️ Never commit `.env.local` to version control. It is already listed in `.gitignore`.

***

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 3000 |
| `npm run build` | Build production bundle to `/dist` |
| `npm run electron:dev`| Run the app natively in Electron |
| `npm run lint` | TypeScript type check (no emit) and Biome analysis |
| `npm run server` | Start Hono + WebSocket backend |
| `npm run mcp` | Start MCP server |
| `npm run test:e2e` | Run Playwright end-to-end tests |

***

## Project Structure

```
Nexus-Alpha/
├── docs/                 # Planning docs, checklists, and architecture rules
├── src/
│   ├── components/       # UI elements and tab views (src/components/views)
│   ├── features/         # Feature modules (vibecoder, composer, terminal, etc.)
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API clients, CRDT syncing, orchestration (Cheetah)
│   ├── stores/           # Zustand state stores
│   ├── server/           # Backend (Hono, MCP, Queues)
│   └── lib/              # Utility functions
├── cheetah/              # Overlay Cheetah V3 engine tasks and templates
├── electron/             # Electron desktop bindings
├── tests/                # Playwright e2e tests
├── vite.config.ts        # Vite configuration
└── package.json          # Dependency management
```

***

## License

Apache 2.0 — see [`LICENSE`](./LICENSE) for details.
