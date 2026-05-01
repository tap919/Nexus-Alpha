# Nexus Alpha

**Nexus Alpha** is an AI-powered developer intelligence dashboard and autonomous orchestration engine built with React, TypeScript, and Vite. It aggregates real-time signals from the open-source ecosystem, manages pipeline executions, and employs the powerful **Cheetah V3** autocoder engine for secure, deterministic full-stack code generation.

***

## Features

- **Cheetah V3 Autocoder** — State-of-the-art Python-based code generation engine bridged with a TypeScript-native fallback for autonomous architectural expansion and multi-file synthesis.
- **Hono Backend Platform** — High-performance backend routing built on Hono, featuring strict rate-limiting, JWT/API Key dual-authentication, and robust proxy safeguards.
- **AI Intelligence Dashboard** — Live feed of AI ecosystem growth metrics, developer activity, model counts, and sentiment scoring powered by Gemini.
- **Build Pipeline Orchestrator** — Multi-step pipeline execution with E2E test integration via Playwright and real-time progress tracking.
- **Self-Healing Loop** — Autonomous auto-fix loops with strict security gating (`NEXUS_ALLOW_AUTO_FIX`), granular RCE command allowlists, and atomic fix-history management.
- **Trending Repo Analysis** — Fetches and analyzes trending GitHub repositories with AI-generated stack summaries, utility scores, and build type classification.
- **MCP Server Integration** — Built-in Model Context Protocol server (`src/server/mcp.ts`) for agent-to-agent tool calling.
- **Browser Automation Module** — Tracks navigation history, DOM snapshots, and element observations for agentic browser tasks (with secure sandboxing).
- **RAG Context** — Indexed document retrieval attached to pipeline runs for grounded AI responses.
- **Real-Time WebSocket Feed** — Live signal stream for market/ecosystem signals and synergy insights.

***

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 6 |
| Animations | Motion (Framer Motion successor) |
| State | Zustand |
| Routing | React Router v6 |
| Backend | **Hono**, WebSocket (`ws`) |
| Autocoder | **Overlay Cheetah V3** (Python/Jinja2 + TS Fallback) |
| AI | Google Gemini (`@google/genai`) |
| MCP | `@modelcontextprotocol/sdk` |
| Database/Auth | Supabase |
| Testing | Playwright |

***

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Google Gemini API key** (required) — get one at [ai.google.dev](https://ai.google.dev)
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
| `npm run preview` | Preview production build locally |
| `npm run lint` | TypeScript type check (no emit) |
| `npm run server` | Start Hono + WebSocket backend |
| `npm run mcp` | Start MCP server |
| `npm run test:e2e` | Run Playwright end-to-end tests |

***

## Project Structure

```
Nexus-Alpha/
├── src/
│   ├── components/       # UI elements and tab views (src/components/views)
│   ├── features/         # Feature-specific components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions and helpers
│   ├── services/         # API clients and orchestration (Cheetah, AutoFix)
│   ├── stores/           # Zustand state stores
│   ├── types/            # Shared TypeScript interfaces
│   └── server/
│       ├── hono.ts       # Main Hono backend and WebSocket server
│       ├── legacyRoutes.ts # Migrated Express endpoints
│       └── mcp.ts        # MCP server implementation
├── cheetah/              # Overlay Cheetah V3 engine tasks and templates
├── tests/                # Playwright e2e tests
├── ARCHITECTURE.md       # Canonical directory ownership rules
├── vite.config.ts        # Vite configuration
└── package.json          # Dependency management
```

***

## License

Apache 2.0 — see [`LICENSE`](./LICENSE) for details.
