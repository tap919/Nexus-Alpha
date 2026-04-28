/**
 * Nexus Alpha MCP Server
 * Implements Model Context Protocol (MCP) using @modelcontextprotocol/sdk
 * Exposes tools: analyze_repo, trigger_pipeline, search_repos, get_agent_status
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { searchTrendingRepos, getRepo } from "../services/githubService";
import { analyzeRepoSynergy } from "../services/geminiService";

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
  ],
}));

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
      const res = await fetch("http://localhost:3000/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repos, agentId }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: `Pipeline started. ID: ${data.executionId}` }],
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
