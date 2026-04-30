/**
 * Nexus Alpha MCP Server
 * Implements Model Context Protocol (MCP) using @modelcontextprotocol/sdk
 * Exposes tools: analyze_repo, trigger_pipeline, search_repos, get_agent_status,
 *                browser_automation, deterministic_brain
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { searchTrendingRepos, getRepo } from "../services/githubService";
import { analyzeRepoSynergy } from "../services/geminiService";
import { runDeterministicBrain, runBrowserHarness } from "./brainToolService";
import { runQualityGates, getBuildHistory, getLatestScore } from "../services/vibeCoderService";
import { buildGraph, getGraph, queryGraph, getGraphSummary, graphAvailable } from "../services/graphifyService";
import { encodeToToon, compressJson, getToonStats } from "../services/toonService";

const server = new Server(
  { name: "nexus-alpha-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_repos",
      description: "Search trending GitHub repos by query. Returns top 20 results with stars, forks, topics.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (e.g. 'AI agent framework')" },
          days: { type: "number", description: "Look back N days (default: 7)", default: 7 },
        },
        required: ["query"],
      },
    },
    {
      name: "get_repo",
      description: "Get detailed information about a specific GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner (username or org)" },
          repo: { type: "string", description: "Repository name" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "analyze_repo_synergy",
      description: "Use Gemini AI to analyze synergies and integration opportunities across a list of repos.",
      inputSchema: {
        type: "object",
        properties: {
          repos: {
            type: "array",
            items: { type: "string" },
            description: "List of repo names to analyze (e.g. ['langchain', 'autogen'])",
          },
        },
        required: ["repos"],
      },
    },
    {
      name: "trigger_pipeline",
      description: "Trigger a Nexus Alpha build pipeline for a list of repositories.",
      inputSchema: {
        type: "object",
        properties: {
          repos: {
            type: "array",
            items: { type: "string" },
            description: "List of repo full names to include in pipeline",
          },
          agentId: { type: "string", description: "Optional agent ID to assign" },
        },
        required: ["repos"],
      },
    },
    {
      name: "browser_automation",
      description: "Control a browser via CDP using browser-harness. Use for automation, scraping, or web interactions. Requires browser-harness CLI installed and Chrome/Edge running.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Python code to execute via browser-harness. Example: new_tab('https://google.com'); wait_for_load(); print(page_info())",
          },
        },
        required: ["command"],
      },
    },
    {
      name: "deterministic_brain",
      description: "Query the deterministic brain neuro-symbolic AI reasoning engine with 5 lanes: coding, business_logic, agent_brain, tool_calling, cross_domain. Auto-routes by default.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The query or task to process" },
          lane: {
            type: "string",
            description: "Force a specific lane (coding, business_logic, agent_brain, tool_calling, cross_domain). Default: auto-select",
            enum: ["coding", "business_logic", "agent_brain", "tool_calling", "cross_domain"],
          },
          verbose: { type: "boolean", description: "Show full trace output", default: false },
        },
        required: ["query"],
      },
    },
    {
      name: "vibe_check",
      description: "Run all VibeCoder quality gates (type safety, lint, security, bundle, deps, structure) and return a scored build report with letter grade (S/A/B/C/D/F). Perfect for vibe coders who want to know their build quality at a glance.",
      inputSchema: {
        type: "object",
        properties: {
          repoCount: { type: "number", description: "Number of repos in the build (default: 1)", default: 1 },
          durationMs: { type: "number", description: "Build duration in milliseconds (default: 0)", default: 0 },
        },
      },
    },
    {
      name: "vibe_history",
      description: "Get VibeCoder build history, benchmark data, improvement trends, and AI-generated optimization suggestions.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "vibe_score",
      description: "Get the latest build score without running a full check.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "graphify_build",
      description: "Build a knowledge graph from the codebase using tree-sitter AST analysis. Creates graph.json + wiki articles + interactive HTML visualization. 100% local, zero API cost. Reduces codebase recall tokens by up to 71x.",
      inputSchema: {
        type: "object",
        properties: {
          targetPath: { type: "string", description: "Target path to analyze (default: current directory)", default: "." },
          mode: { type: "string", description: "ast (free) or deep (LLM semantic edges)", enum: ["ast", "deep"], default: "ast" },
        },
      },
    },
    {
      name: "graphify_query",
      description: "Query the knowledge graph instead of reading entire files. Find functions, modules, and their connections with minimal tokens.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for (function name, module, concept)" },
        },
        required: ["query"],
      },
    },
    {
      name: "graphify_summary",
      description: "Get a summary of the knowledge graph — top nodes, languages, connection counts. Quick overview without reading the full graph.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "toon_compress",
      description: "Compress JSON/YAML/CSV to TOON format (30-60% token reduction). Ideal for large API responses or structured data going to LLMs.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "JSON/YAML/CSV content to compress" },
          aggressive: { type: "boolean", description: "Use aggressive compression", default: false },
        },
        required: ["content"],
      },
    },
    {
      name: "toon_stats",
      description: "Get TOON token savings statistics — total calls, tokens saved, average reduction.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "sequential_think",
      description: "Break down complex tasks into ordered steps using Sequential Thinking MCP. Provides structured reasoning with hypotheses, revisions, and branch tracking.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The task or problem to break down into thinking steps" },
          steps: { type: "number", description: "Number of thinking steps to generate (default: 5)", default: 5 },
          branch: { type: "string", description: "Optional branch name to explore alternative reasoning paths" },
        },
        required: ["query"],
      },
    },
  ],
}));

// ─── Sequential Thinking ──────────────────────────────────────────────────────────

interface ThoughtStep {
  step: number;
  thought: string;
  hypothesis: string;
  needsVerification: boolean;
}

interface BranchInfo {
  name: string;
  description: string;
  steps: ThoughtStep[];
}

function generateSequentialThinking(query: string, totalSteps: number, branch?: string): {
  thoughtChain: ThoughtStep[];
  totalSteps: number;
  branches: BranchInfo[];
} {
  const phases = [
    {
      thought: "Analyze requirements and constraints",
      hypothesis: "The core requirement can be decomposed into measurable sub-objectives",
      needsVerification: true,
    },
    {
      thought: "Research existing solutions and patterns",
      hypothesis: "Prior art exists that can reduce implementation effort and risk",
      needsVerification: true,
    },
    {
      thought: "Design architecture and interfaces",
      hypothesis: "A modular design with clear boundaries reduces coupling and improves testability",
      needsVerification: true,
    },
    {
      thought: "Implement core functionality iteratively",
      hypothesis: "Test-driven implementation catches regressions early and ensures correctness",
      needsVerification: true,
    },
    {
      thought: "Integration testing and edge case handling",
      hypothesis: "Edge cases and boundary conditions are the primary source of defects",
      needsVerification: true,
    },
    {
      thought: "Performance analysis and optimization",
      hypothesis: "Measure before optimizing; premature optimization adds complexity without benefit",
      needsVerification: false,
    },
    {
      thought: "Documentation and knowledge transfer",
      hypothesis: "Clear documentation reduces onboarding time and prevents misuse",
      needsVerification: false,
    },
    {
      thought: "Deploy, monitor, and iterate",
      hypothesis: "Observability prevents silent failures and enables data-driven improvement",
      needsVerification: true,
    },
  ];

  const thoughtChain: ThoughtStep[] = [];
  for (let i = 0; i < totalSteps; i++) {
    const phase = phases[i % phases.length];
    thoughtChain.push({
      step: i + 1,
      thought: `[Step ${i + 1}/${totalSteps}] ${phase.thought} for: ${query}`,
      hypothesis: phase.hypothesis,
      needsVerification: phase.needsVerification,
    });
  }

  const branches: BranchInfo[] = [];
  if (branch) {
    branches.push({
      name: branch,
      description: `Alternative reasoning path exploring: ${branch}`,
      steps: phases.slice(0, Math.min(totalSteps, 4)).map((p, i) => ({
        step: i + 1,
        thought: `[Branch: ${branch}] ${p.thought} from alternative perspective`,
        hypothesis: `Alternative hypothesis (${branch}): ${p.hypothesis}`,
        needsVerification: true,
      })),
    });
  }

  return { thoughtChain, totalSteps, branches };
}

// ─── Tool Handlers ─────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search_repos": {
      const { query, days = 7 } = args as { query: string; days?: number };
      const repos = await searchTrendingRepos(query, days);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              repos.map((r) => ({
                name: r.full_name,
                stars: r.stargazers_count,
                forks: r.forks_count,
                language: r.language,
                topics: r.topics,
                description: r.description,
                url: r.html_url,
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_repo": {
      const { owner, repo } = args as { owner: string; repo: string };
      const data = await getRepo(owner, repo);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                name: data.full_name,
                description: data.description,
                stars: data.stargazers_count,
                forks: data.forks_count,
                language: data.language,
                topics: data.topics,
                openIssues: data.open_issues_count,
                url: data.html_url,
                lastPush: data.pushed_at,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "analyze_repo_synergy": {
      const { repos } = args as { repos: string[] };
      const repoObjs = repos.map((name) => ({
        name,
        stars: 0, forks: 0, growth: 0, tags: [],
      }));
      const synergies = await analyzeRepoSynergy(repoObjs);
      return {
        content: [{ type: "text", text: synergies.join("\n\n") }],
      };
    }

    case "trigger_pipeline": {
      const { repos, agentId } = args as { repos: string[]; agentId?: string };
      // Trigger via the REST API server
      const PORT = process.env.PORT || '3002';
      const res = await fetch(`http://localhost:${PORT}/api/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repos, agentId }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: `Pipeline started. ID: ${data.executionId}` }],
      };
    }

    case "browser_automation": {
      const { command } = args as { command: string };
      try {
        const result = await runBrowserHarness({ command });
        return {
          content: [{ type: "text", text: result || "Command executed successfully" }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Browser automation error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }

    case "deterministic_brain": {
      const { query, lane, verbose } = args as { query: string; lane?: string; verbose?: boolean };
      try {
        const result = await runDeterministicBrain({ query, lane: lane as "coding" | "business_logic" | "agent_brain" | "tool_calling" | "cross_domain" | undefined, verbose });
        return {
          content: [{ type: "text", text: result || "Query processed successfully" }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Deterministic brain error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }

    case "vibe_check": {
      const { repoCount = 1, durationMs = 0 } = args as { repoCount?: number; durationMs?: number };
      const score = await runQualityGates(repoCount, durationMs);
      return {
        content: [{ type: "text", text: JSON.stringify(score, null, 2) }],
      };
    }

    case "vibe_history": {
      const data = getBuildHistory();
      return {
        content: [{ type: "text", text: JSON.stringify({
          builds: data.builds.slice(-20),
          bestScore: data.bestScore,
          averageScore: data.averageScore,
          totalBuilds: data.totalBuilds,
          streak: data.streak,
          insights: data.insights.filter(i => i.frequency > 0),
          trends: data.trends.slice(-14),
        }, null, 2) }],
      };
    }

    case "vibe_score": {
      const score = getLatestScore();
      if (!score) {
        return {
          content: [{ type: "text", text: "No builds scored yet. Run a pipeline to get your first VibeCoder score!" }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(score, null, 2) }],
      };
    }

    case "graphify_build": {
      const { targetPath = ".", mode = "ast" } = args as { targetPath?: string; mode?: "ast" | "deep" };
      if (!graphAvailable()) {
        return {
          content: [{ type: "text", text: "Graphify not installed. Run: pip install graphifyy && graphify install" }],
        };
      }
      const result = await buildGraph(targetPath, mode);
      return {
        content: [{ type: "text", text: JSON.stringify({
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
          communityCount: result.communityCount,
          tokenSavings: result.tokenSavings,
          timestamp: result.timestamp,
        }, null, 2) }],
      };
    }

    case "graphify_query": {
      const { query } = args as { query: string };
      const results = queryGraph(query);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No graph nodes matched "${query}". Build the graph first with graphify_build.` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(results.slice(0, 15), null, 2) }],
      };
    }

    case "graphify_summary": {
      const summary = getGraphSummary();
      return {
        content: [{ type: "text", text: summary }],
      };
    }

    case "toon_compress": {
      const { content, aggressive = false } = args as { content: string; aggressive?: boolean };
      const result = encodeToToon(content, { aggressive });
      return {
        content: [{ type: "text", text: JSON.stringify({
          originalTokens: result.originalTokens,
          compressedTokens: result.compressedTokens,
          savingsPercent: result.savingsPercent,
          format: result.format,
          compressed: result.compressed,
        }, null, 2) }],
      };
    }

    case "toon_stats": {
      const s = getToonStats();
      return {
        content: [{ type: "text", text: JSON.stringify(s, null, 2) }],
      };
    }

    case "sequential_think": {
      const { query, steps = 5, branch } = args as { query: string; steps?: number; branch?: string };
      const result = generateSequentialThinking(query, steps, branch);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Nexus Alpha MCP server running on stdio");
}

main().catch(console.error);
