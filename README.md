# Nexus Alpha

**Nexus Alpha** is an AI-powered developer intelligence dashboard built with React, TypeScript, and Vite. It aggregates real-time signals from the open-source ecosystem — trending GitHub repos, AI news, build pipelines, custom agents, and MCP (Model Context Protocol) servers — into a single unified interface, with Google Gemini as its core reasoning engine.

***

## Features

- **AI Intelligence Dashboard** — Live feed of AI ecosystem growth metrics, developer activity, model counts, and sentiment scoring powered by Gemini
- **Trending Repo Analysis** — Fetches and analyzes trending GitHub repositories with AI-generated stack summaries, utility scores, and build type classification
- **Build Pipeline Orchestrator** — Multi-step pipeline execution with E2E test integration via Playwright and real-time progress tracking
- **Custom Agent Registry** — Load and analyze external scripts, config folders, or agent files; each agent gets live status and AI analysis
- **MCP Server Integration** — Built-in Model Context Protocol server (`src/server/mcp.ts`) for agent-to-agent tool calling
- **Browser Automation Module** — Tracks navigation history, DOM snapshots, and element observations for agentic browser tasks
- **Multi-Provider CLI** — Switch between OpenCode, OpenRouter, and DeepSeek providers from within the app
- **RAG Context** — Indexed document retrieval attached to pipeline runs for grounded AI responses
- **Real-Time WebSocket Feed** — Live signal stream for market/ecosystem signals and synergy insights
- **Supabase Auth** — Optional authentication via Supabase for persistent sessions

***

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 6 |
| Animations | Motion (Framer Motion successor) |
| State | Zustand |
| Charts | Recharts |
| Icons | Lucide React |
| Routing | React Router v6 |
| Backend | Express + WebSocket (`ws`) |
| AI | Google Gemini (`@google/genai`) |
| MCP | `@modelcontextprotocol/sdk` |
| Database/Auth | Supabase |
| Testing | Playwright |

***

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Google Gemini API key** (required) — get one at [ai.google.dev](https://ai.google.dev)

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

Open `.env.local` and fill in your values. At minimum, set `GEMINI_API_KEY`.

### 4. Start the development servers

**Frontend (Vite):**
```bash
npm run dev
```
Runs at [http://localhost:3000](http://localhost:3000)

**Backend (Express + WebSocket):**
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
| `GITHUB_TOKEN` | Optional | GitHub PAT for live repo data and workflow triggers (repo + workflow scopes) |
| `OPENROUTER_API_KEY` | Optional | OpenRouter key for multi-model CLI provider |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek key for CLI provider |
| `OPENCODE_API_KEY` | Optional | OpenCode/Gemini alias |
| `SUPABASE_URL` | Optional | Supabase project URL for auth |
| `SUPABASE_ANON_KEY` | Optional | Supabase anon key for auth |
| `PORT` | Optional | HTTP server port (default: `3000`) |
| `WS_PORT` | Optional | Legacy setting; WebSocket upgrades are served on `PORT` at `/ws` |
| `APP_URL` | Optional | App base URL (default: `http://localhost:3000`) |
| `WEBHOOK_SECRET` | Optional | Secret for verifying incoming webhook payloads |

> ⚠️ Never commit `.env.local` to version control. It is already listed in `.gitignore`.

***

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 3000 |
| `npm run build` | Build production bundle to `/dist` |
| `npm run preview` | Preview production build locally |
| `npm run clean` | Remove the `/dist` directory |
| `npm run lint` | TypeScript type check (no emit) |
| `npm run server` | Start Express + WebSocket backend |
| `npm run mcp` | Start MCP server |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run test:e2e:ui` | Run Playwright tests with interactive UI |

***

## Project Structure

```
Nexus-Alpha/
├── src/
│   ├── App.tsx           # Root component and all dashboard views
│   ├── main.tsx          # React entry point
│   ├── index.css         # Global styles
│   ├── types.ts          # Shared TypeScript interfaces
│   ├── lib/              # Utility functions and helpers
│   ├── services/         # API clients and data-fetching services
│   ├── stores/           # Zustand state stores
│   └── server/
│       ├── index.ts      # Express + WebSocket server
│       └── mcp.ts        # MCP server implementation
├── tests/                # Playwright e2e tests
├── .env.example          # Environment variable template
├── vite.config.ts        # Vite configuration
├── playwright.config.ts  # Playwright configuration
├── tsconfig.json         # TypeScript configuration
└── metadata.json         # App metadata
```

***

## License

Apache 2.0 — see [`LICENSE`](./LICENSE) for details.
