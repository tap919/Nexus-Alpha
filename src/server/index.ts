/**
 * Nexus Alpha Express + WebSocket Server
 * Provides:
 *  - REST API for pipeline triggers
 *  - WebSocket server on port 3001 for live build log streaming
 *  - Integration endpoints for Nanobot, Mem0, Qdrant, Firecrawl, Tavily
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "fs";
import { runAutomatedPipeline } from "../services/pipelineService";
import CodingAgentService from "../services/codingAgentService";
import type { PipelineExecution } from "../types";
import { integrationHub } from "../services/integrationService";
import { runDeterministicBrain, runBrowserHarness, findBrainDir, isAvailable } from "./brainToolService";
import { initPipelineQueue, enqueuePipeline, shutdownPipelineQueue } from "./pipelineQueue";
import { broadcastService } from "./broadcastService";
import {
  trackError,
  resolveError,
  getErrorStats,
  getRecentErrors,
  getRecoveryPatterns,
  getRecommendedRecovery,
} from "../services/errorTrackingService";
import { start as startLocalInfra, getStatus as getLocalInfraStatus, stop as stopLocalInfra } from "../services/local-infra";
import { getAllSuggestions, getActiveSuggestions, getSuggestionHistory } from "../services/suggestionService";
import { runQualityGates, getBuildHistory, getLatestScore, GATE_DEFINITIONS } from "../services/vibeCoderService";
import { updateBenchmark } from "../services/benchmarkService";
import { getGraphSummary, queryGraph, graphAvailable } from "../services/graphifyService";
import { encodeToToon, getToonStats, compressJson } from "../services/toonService";
import { getBrainStatus, getBrainHealth, updateBrainConfig, reloadBrain } from "./brainControlService";
import { fetchGitHubTrending, fetchAIVideos } from "../services/realTimeDataService";
import { cloneRepo } from "../services/repoLoaderService";
import { assessAgentFolder } from "../services/agentAssessmentService";
import { runBuildCommand, runAuditCommand, runLintCommand, runTestsCommand } from "./realTools";
import { initLogService, getExecutionLog } from "./logService";
import { initAuditService, getAuditLogs } from "./auditLogService";
import { listPullRequests, updateHunkStatus } from "../services/prAgentService";
import { listAppFiles, readAppFile, writeAppFile } from "./editorService";
import { getMarketplaceExtensions, searchMarketplace, incrementDownloads } from "./marketplaceService";
import { proxyRouter, setProxyKeys } from './proxyRoutes';

const app = express();
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again in 1 minute" },
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.STRICT_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded" },
});

const API_KEY = process.env.NEXUS_API_KEY || 'nexus-alpha-dev-key';

function requireAuth(req: any, res: any, next: any) {
  const auth = req.headers['x-nexus-api-key'] || req.headers['authorization'];
  if (auth !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing NEXUS_API_KEY" });
  }
  next();
}

// 1. Move Auth middleware before any /api routes (fixing Issue #1)
app.use("/api/", (req, res, next) => {
  // Allow OPTIONS for CORS preflight if needed
  if (req.method === 'OPTIONS') return next();
  
  // Exclude non-api routes if any, but currently all are /api
  requireAuth(req, res, next);
});

const httpServer = createServer(app);

const PORT_HTTP = Number(process.env.PORT ?? 3002);
const PORT_WS   = Number(process.env.WS_PORT ?? 3001);

// ─── API Proxy: Server-side API key management (anti-exposure) ──────────────────
const SERVER_API_KEYS = {
  gemini: process.env.GEMINI_API_KEY ?? '',
  github: process.env.GITHUB_TOKEN ?? '',
  openrouter: process.env.OPENROUTER_API_KEY ?? '',
  deepseek: process.env.DEEPSEEK_API_KEY ?? '',
  openai: process.env.OPENAI_API_KEY ?? '',
} as const;

setProxyKeys(SERVER_API_KEYS);
app.use('/api/proxy', proxyRouter);

// ─── Rate Limiting for API routes ─────
app.use("/api/", apiLimiter);
app.use("/api/wiki", strictLimiter);
app.use("/api/autoresearch", strictLimiter);
app.use("/api/pipeline", strictLimiter);
app.use("/api/github", strictLimiter);

// ─── WebSocket Server ───────────────────────────────────────────────────────────
const wsServer = new WebSocketServer({ server: httpServer, path: '/ws' });

const clients = new Set<WebSocket>();

wsServer.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  ws.send(JSON.stringify({ type: "connected", message: "Nexus Alpha WS ready", ts: Date.now() }));

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on("error", (err) => {
    clients.delete(ws);
    console.error(`[WS] Client error: ${err.message}`);
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    } catch {
      // ignore bad messages
    }
  });
});

function broadcast(data: unknown): void {
  const json = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

broadcastService.setHandler(broadcast);

// ─── REST API ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", wsClients: clients.size, ts: Date.now() });
});

// MVP: Coding generation endpoint
app.post("/api/coding/generate", async (req, res) => {
  try {
    const { description } = req.body as { description: string };
    if (!description) return res.status(400).json({ error: 'description required' });
    const svc = new CodingAgentService();
    const result = await svc.generateApp({ description });
  res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/pipeline/run - trigger a pipeline and stream updates via WS */
app.post("/api/pipeline/run", async (req, res) => {
  const { repos, agentId } = req.body as { repos: string[]; agentId?: string };
  if (!Array.isArray(repos) || repos.length === 0) {
    return res.status(400).json({ error: "repos array required" });
  }

  const result = await enqueuePipeline(repos, agentId);

  if (!result.simulated) {
    res.json({ started: true, executionId: result.id, mode: 'queue' });
    return;
  }

  // Fallback: simulated pipeline (no Redis/BullMQ)
  let executionId = "";
  const t0 = Date.now();

  runAutomatedPipeline(repos.join(' + '), (exec: PipelineExecution) => {
    if (!executionId) executionId = exec.id;
    broadcast({ type: "pipeline:update", execution: exec });
  }).then(async (result) => {
    // Score the build via VibeCoder
    const durationMs = Date.now() - t0;
    try {
      const score = await runQualityGates(repos.length, durationMs);
      updateBenchmark('TYPE_SAFETY', score.gates[0]?.score ?? 0);
      updateBenchmark('STRUCTURE', score.gates[5]?.score ?? 0);
    } catch { /* quality gates unavailable */ }
    // Track gamification
    trackPipelineRun(result.status === 'success', repos.length);
  }).catch(() => {});

  res.json({ started: true, executionId: result.id, mode: 'simulated' });
});

// Real tools API: build and audit using host shell

app.post("/api/tools/run", async (req, res) => {
  const { tool } = req.body as { tool: 'build' | 'audit' | 'lint' | 'test' };
  if (!tool || !['build','audit','lint','test'].includes(tool)) {
    return res.status(400).json({ error: 'tool must be one of: build, audit, lint, test' });
  }

  try {
    let result: { stdout: string; stderr: string; code: number | null };
    switch (tool) {
      case 'build':
        result = await runBuildCommand();
        break;
      case 'audit':
        result = await runAuditCommand();
        break;
      case 'lint':
        result = await runLintCommand();
        break;
      case 'test':
        result = await runTestsCommand();
        break;
    }
    res.json({ tool, result, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/pipeline/status - returns WS client count */
app.get("/api/pipeline/status", (_req, res) => {
  res.json({ wsClients: clients.size, ts: Date.now() });
});

// ─── HOOKS API ───────────────────────────────────────────────────────────────

import {
  getHooks,
  addHook,
  updateHook,
  removeHook,
  toggleHook,
  getHookStats,
} from "../services/hookEngine";
import { getFixHistory, getFixSuccessRate } from "../services/autoFixLoop";

app.get("/api/hooks", (_req, res) => {
  try {
    const hooks = getHooks();
    const stats = getHookStats();
    res.json({ hooks, stats });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/hooks", (req, res) => {
  try {
    const hook = addHook(req.body);
    res.json({ hook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.put("/api/hooks/:id", (req, res) => {
  try {
    const hook = updateHook(req.params.id, req.body);
    if (!hook) return res.status(404).json({ error: "Hook not found" });
    res.json({ hook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.delete("/api/hooks/:id", (req, res) => {
  try {
    const removed = removeHook(req.params.id);
    if (!removed) return res.status(404).json({ error: "Hook not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/hooks/:id/toggle", (req, res) => {
  try {
    const hook = toggleHook(req.params.id);
    if (!hook) return res.status(404).json({ error: "Hook not found" });
    res.json({ hook });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/pipeline/fix-history", (_req, res) => {
  try {
    const history = getFixHistory();
    const successRate = getFixSuccessRate();
    res.json({ history, successRate });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── INTEGRATION API ENDPOINTS ─────────────────────────────────────────────────

/** GET /api/integrations/status - Check all integration connection statuses */
app.get("/api/integrations/status", async (_req, res) => {
  try {
    const status = await integrationHub.getStatus();
    res.json({ 
      connected: Object.values(status).some(v => v),
      services: status,
      ts: Date.now() 
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/integrations/agent/chat - Send message to Nanobot agent */
app.post("/api/integrations/agent/chat", async (req, res) => {
  const { message, sessionId } = req.body as { message: string; sessionId?: string };
  
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    if (!integrationHub.nanobot) {
      return res.status(503).json({ error: "Nanobot not configured" });
    }

    const response = await integrationHub.nanobot.sendMessage(message, sessionId);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/integrations/search/web - Search the web via Firecrawl/Tavily */
app.post("/api/integrations/search/web", async (req, res) => {
  const { query, source } = req.body as { query: string; source?: "firecrawl" | "tavily" | "all" };
  
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    let results;
    
    if (source === "firecrawl" && integrationHub.firecrawl) {
      results = await integrationHub.firecrawl.search(query);
    } else if (source === "tavily" && integrationHub.tavily) {
      results = await integrationHub.tavily.search(query);
    } else {
      // Search all sources
      results = await integrationHub.searchAll(query);
    }

    res.json({ results, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/integrations/memory/add - Add memory to Mem0 */
app.post("/api/integrations/memory/add", async (req, res) => {
  const { userId, content, metadata } = req.body as { 
    userId: string; 
    content: string; 
    metadata?: Record<string, unknown> 
  };

  if (!userId || !content) {
    return res.status(400).json({ error: "userId and content are required" });
  }

  try {
    if (!integrationHub.mem0) {
      return res.status(503).json({ error: "Mem0 not configured" });
    }

    const success = await integrationHub.mem0.addMemory(userId, content, metadata);
    res.json({ success, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** GET /api/integrations/memory - Get memories from Mem0 */
app.get("/api/integrations/memory/:userId", async (req, res) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    if (!integrationHub.mem0) {
      return res.status(503).json({ error: "Mem0 not configured" });
    }

    const memories = await integrationHub.mem0.getMemories(userId, limit);
    res.json({ memories, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/integrations/vector/search - Search Qdrant vector store */
app.post("/api/integrations/vector/search", async (req, res) => {
  const { collection, query, vector, limit } = req.body as { 
    collection?: string; 
    query?: string; 
    vector?: number[];
    limit?: number 
  };

  if (!integrationHub.qdrant) {
    return res.status(503).json({ error: "Qdrant not configured" });
  }

  try {
    const collectionName = collection || "knowledge_base";
    const results = await integrationHub.qdrant.search(collectionName, vector || [], limit || 5);
    res.json({ results, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/integrations/vector/upsert - Add vectors to Qdrant */
app.post("/api/integrations/vector/upsert", async (req, res) => {
  const { collection, points } = req.body as { 
    collection?: string; 
    points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> 
  };

  if (!points || !Array.isArray(points)) {
    return res.status(400).json({ error: "points array is required" });
  }

  if (!integrationHub.qdrant) {
    return res.status(503).json({ error: "Qdrant not configured" });
  }

  try {
    const collectionName = collection || "knowledge_base";
    const success = await integrationHub.qdrant.upsert(collectionName, points);
    res.json({ success, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/integrations/trace - Create Langfuse trace */
app.post("/api/integrations/trace", async (req, res) => {
  const { name, metadata } = req.body as { name: string; metadata?: Record<string, unknown> };

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    if (!integrationHub.langfuse) {
      return res.status(503).json({ error: "Langfuse not configured" });
    }

    const traceId = await integrationHub.langfuse.createTrace(name, metadata);
    res.json({ traceId, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ─── PERMISSIONS API ─────────────────────────────────────────────────────────

import {
  getRules,
  addRule,
  updateRule,
  removeRule,
  toggleRule,
  checkPermission,
  getPermissionsForScope,
} from "../services/permissionManager";
import type { PermissionScope } from "../types/permissions";

app.get("/api/permissions", (_req, res) => {
  try {
    const rules = getRules();
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/permissions", (req, res) => {
  try {
    const rule = addRule(req.body);
    res.json({ rule });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.put("/api/permissions/:id", (req, res) => {
  try {
    const rule = updateRule(req.params.id, req.body);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    res.json({ rule });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.delete("/api/permissions/:id", (req, res) => {
  try {
    const removed = removeRule(req.params.id);
    if (!removed) return res.status(404).json({ error: "Rule not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/permissions/:id/toggle", (req, res) => {
  try {
    const rule = toggleRule(req.params.id);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    res.json({ rule });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/permissions/check", (req, res) => {
  try {
    const { scope, target } = req.body as { scope: PermissionScope; target: string };
    if (!scope || !target) return res.status(400).json({ error: "scope and target required" });
    const result = checkPermission(scope, target);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/permissions/scope/:scope", (req, res) => {
  try {
    const rules = getPermissionsForScope(req.params.scope as PermissionScope);
    res.json({ rules });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── PLANS API ────────────────────────────────────────────────────────────────

import {
  generatePlan,
  getPlan,
  approvePlan,
  rejectPlan,
  listPlans,
  validatePlan,
} from "../services/planAgent";

app.post("/api/plans/generate", async (req, res) => {
  try {
    const { repos, task } = req.body as { repos: string[]; task?: string };
    if (!repos || repos.length === 0) return res.status(400).json({ error: "repos required" });
    const plan = await generatePlan(repos, task);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/plans", (_req, res) => {
  try {
    const plans = listPlans();
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/plans/:id", (req, res) => {
  try {
    const plan = getPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/plans/:id/approve", (req, res) => {
  try {
    const plan = approvePlan(req.params.id, req.body?.approvedBy);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/plans/:id/reject", (req, res) => {
  try {
    const plan = rejectPlan(req.params.id, req.body?.reason);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/plans/:id/validate", async (req, res) => {
  try {
    const plan = getPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const validation = await validatePlan(plan);
    res.json(validation);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── CHECKPOINTS API ──────────────────────────────────────────────────────────

import {
  createCheckpoint,
  restoreCheckpoint,
  getCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  getCurrentCheckpointId,
} from "../services/sessionCheckpoint";

app.post("/api/checkpoints", (req, res) => {
  try {
    const { label, metadata } = req.body as { label: string; metadata?: Record<string, unknown> };
    if (!label) return res.status(400).json({ error: "label required" });
    const checkpoint = createCheckpoint(label, metadata);
    if (!checkpoint) return res.status(500).json({ error: "Checkpoint creation failed" });
    res.json({ checkpoint });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── MARKETPLACE API ──────────────────────────────────────────────────────────

app.get("/api/marketplace/extensions", (req, res) => {
  try {
    const query = req.query.q as string;
    const extensions = query ? searchMarketplace(query) : getMarketplaceExtensions();
    res.json({ extensions });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/marketplace/extensions/:name/install", (req, res) => {
  try {
    const success = incrementDownloads(req.params.name);
    if (!success) {
      return res.status(404).json({ error: "Extension not found" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/checkpoints", (_req, res) => {
  try {
    const checkpoints = listCheckpoints();
    const currentId = getCurrentCheckpointId();
    res.json({ checkpoints, currentId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/checkpoints/:id", (req, res) => {
  try {
    const checkpoint = getCheckpoint(req.params.id);
    if (!checkpoint) return res.status(404).json({ error: "Checkpoint not found" });
    res.json({ checkpoint });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.post("/api/checkpoints/:id/restore", (req, res) => {
  try {
    const restored = restoreCheckpoint(req.params.id);
    if (!restored) return res.status(404).json({ error: "Checkpoint not found or restore failed" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.delete("/api/checkpoints/:id", (req, res) => {
  try {
    const deleted = deleteCheckpoint(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Checkpoint not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── CODE ANALYSIS API ────────────────────────────────────────────────────────

import {
  buildCodeGraph,
  semanticSearch,
  findDependents,
  findCircularDeps,
  analyzeComplexity,
} from "../services/codeAnalyzer";

app.get("/api/code/analyze", async (req, res) => {
  try {
    const rootDir = (req.query.dir as string) || process.cwd();
    const graph = await buildCodeGraph(rootDir);
    const complexity = analyzeComplexity(graph);
    res.json({ graph: { fileCount: graph.files.length, symbolCount: graph.symbolIndex.size, orphanCount: graph.orphanFiles.length }, complexity });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/code/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ error: "q param required" });
    const rootDir = (req.query.dir as string) || process.cwd();
    const graph = await buildCodeGraph(rootDir);
    const results = await semanticSearch(query, graph);
    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/code/complexity", async (req, res) => {
  try {
    const rootDir = (req.query.dir as string) || process.cwd();
    const graph = await buildCodeGraph(rootDir);
    const report = analyzeComplexity(graph);
    const cycles = findCircularDeps(graph);
    res.json({ ...report, cycles });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── MODEL ROUTING API ────────────────────────────────────────────────────────

import {
  routeTask,
  getAvailableModels,
  getModelsForComplexity,
  classifyTaskComplexity,
  type TaskComplexity,
} from "../services/modelRouter";

app.post("/api/model-route", (req, res) => {
  try {
    const { task, preferredProvider, context } = req.body as {
      task: string;
      preferredProvider?: "gemini" | "openrouter" | "deepseek" | "opencode";
      context?: { codeSize?: number; fileCount?: number; isSecurity?: boolean; isPlanning?: boolean };
    };
    if (!task) return res.status(400).json({ error: "task required" });
    const decision = routeTask(task, preferredProvider, context);
    const complexity = classifyTaskComplexity(task, context);
    res.json({ decision, complexity });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

app.get("/api/model-route/models", async (req, res) => {
  try {
    const complexity = req.query.complexity as TaskComplexity | undefined;
    const models = complexity ? getModelsForComplexity(complexity) : getAvailableModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

// ─── GITHUB CREATE / PUSH API ───────────────────────────────────────────────────

/** POST /api/github/create-repo — Create a new GitHub repo */
app.post("/api/github/create-repo", async (req, res) => {
  try {
    const { name, description, private: isPrivate } = req.body as {
      name: string; description?: string; private?: boolean;
    };
    if (!name) return res.status(400).json({ error: "name is required" });
    const token = SERVER_API_KEYS.github || undefined;
    const { createRepo } = await import("../services/githubService");
    const repo = await createRepo(name, { description, private: isPrivate, autoInit: true, token });
    res.json({ repo, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "GitHub create failed" });
  }
});

/** POST /api/github/push-files — Push files to an existing GitHub repo */
app.post("/api/github/push-files", async (req, res) => {
  try {
    const { owner, repo, branch, files, message } = req.body as {
      owner: string; repo: string; branch?: string;
      files: Array<{ path: string; content: string }>;
      message: string;
    };
    if (!owner || !repo || !files || !message) {
      return res.status(400).json({ error: "owner, repo, files, and message are required" });
    }
    const token = SERVER_API_KEYS.github || undefined;
    const { pushFilesToRepo } = await import("../services/githubService");
    await pushFilesToRepo(owner, repo, branch || "main", files, message, token);
    res.json({ pushed: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "GitHub push failed" });
  }
});

/** POST /api/github/create-or-update-file — Create or update a single file */
app.post("/api/github/create-or-update-file", async (req, res) => {
  try {
    const { owner, repo, path, content, message, branch, sha } = req.body as {
      owner: string; repo: string; path: string; content: string;
      message: string; branch?: string; sha?: string;
    };
    if (!owner || !repo || !path || content === undefined || !message) {
      return res.status(400).json({ error: "owner, repo, path, content, and message are required" });
    }
    const token = SERVER_API_KEYS.github || undefined;
    const { createOrUpdateFile } = await import("../services/githubService");
    const result = await createOrUpdateFile(owner, repo, path, content, message, { branch, sha, token });
    res.json({ result, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "GitHub file operation failed" });
  }
});

/** POST /api/github/clone - clone or download a GitHub repository */
app.post('/api/github/clone', async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    if (!url) return res.status(400).json({ error: 'url is required' });
    const repo = await cloneRepo(url);
    res.json(repo);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Clone failed' });
  }
});

// ─── FOLDER UPLOAD API ──────────────────────────────────────────────────────────

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** POST /api/folders/upload — Upload files as a folder for pipeline processing */
app.post("/api/folders/upload", async (req, res) => {
  try {
    const { name, files } = req.body as { name: string; files: Array<{ path: string; content: string }> };
    if (!name || !files || !Array.isArray(files)) {
      return res.status(400).json({ error: "name and files array are required" });
    }

    const folderId = `folder-${Date.now()}`;
    const folderPath = path.join(UPLOAD_DIR, folderId);
    mkdirSync(folderPath, { recursive: true });

    const written: string[] = [];
    for (const f of files) {
      const resolvedPath = path.resolve(folderPath, f.path);
      const normalizedDir = path.dirname(resolvedPath);
      
      // Fix Issue #2: TOCTOU - Ensure resolvedPath is contained and use IT for writing
      if (!resolvedPath.startsWith(folderPath + path.sep)) {
        return res.status(400).json({ error: "Path traversal detected" });
      }
      
      if (!existsSync(normalizedDir)) {
        mkdirSync(normalizedDir, { recursive: true });
      }
      
      writeFileSync(resolvedPath, f.content, "utf-8");
      written.push(f.path);
    }

    res.json({
      folderId,
      folderPath, 
      folderName: name,
      fileCount: written.length,
      files: written,
      ts: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Folder upload failed" });
  }
});

/** GET /api/folders/:folderId — Get folder info and file listing */
app.get("/api/folders/:folderId", async (req, res) => {
  try {
    const requestedPath = path.resolve(UPLOAD_DIR, req.params.folderId);
    if (!requestedPath.startsWith(UPLOAD_DIR + path.sep)) {
      return res.status(400).json({ error: "Invalid folder ID" });
    }
    if (!existsSync(requestedPath)) {
      return res.status(404).json({ error: "Folder not found" });
    }
    const folderPath = requestedPath;
    const fileList: string[] = [];
    function walkDir(dir: string) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walkDir(full);
        else fileList.push(path.relative(folderPath, full));
      }
    }
    walkDir(folderPath);
    res.json({ folderId: req.params.folderId, fileCount: fileList.length, files: fileList, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list files" });
  }
});

/** POST /api/agents/assess — analyze an uploaded agent folder */
app.post("/api/agents/assess", async (req, res) => {
  try {
    const { folderPath } = req.body as { folderPath: string };
    if (!folderPath) return res.status(400).json({ error: "folderPath required" });

    const resolved = path.resolve(folderPath);
    if (!resolved.startsWith(path.resolve(process.cwd(), 'uploads'))) {
      return res.status(400).json({ error: 'Path traversal detected' });
    }

    if (!existsSync(resolved)) return res.status(404).json({ error: "Folder not found on disk" });
    const assessment = assessAgentFolder(resolved);
    res.json(assessment);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Assessment failed" });
  }
});

// ─── LLM WIKI API ────────────────────────────────────────────────────────────────

import {
  getWikiPages, getWikiPage, getWikiStats, getRawFiles,
  ingestRaw, compileWikiPage, compileAllRaw, lintWiki,
} from "../services/llmWikiService";
import { runAutonomousLoop, getAutoresearchStatus, resetAutoresearchLog } from "../services/autoresearchService";
import { getProgression, getAchievements, getLearningInsights, trackPipelineRun, trackRepoScan, trackSearch } from "../services/gamificationService";

/** GET /api/wiki — list all wiki pages */
app.get("/api/wiki", (_req, res) => {
  try {
    const pages = getWikiPages();
    res.json({ pages, stats: getWikiStats(), ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Wiki error" });
  }
});

/** GET /api/wiki/lint — lint the wiki for broken links / stale content */
app.get("/api/wiki/lint", async (_req, res) => {
  try {
    const results = await lintWiki();
    res.json({ results, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Lint error" });
  }
});

/** GET /api/wiki/raw — list raw files */
app.get("/api/wiki/raw", (_req, res) => {
  try {
    const files = getRawFiles();
    res.json({ files, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Raw list error" });
  }
});


/** GET /api/wiki/:slug — get a specific wiki page (must be last to not shadow /lint, /raw) */
app.get("/api/wiki/:slug", (req, res) => {
  try {
    const page = getWikiPage(req.params.slug);
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json({ page, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Wiki error" });
  }
});

/** POST /api/wiki/ingest — ingest raw source material */
app.post("/api/wiki/ingest", (req, res) => {
  try {
    const { source, content, metadata } = req.body as {
      source: string; content: string; metadata?: Record<string, unknown>;
    };
    if (!source || !content) return res.status(400).json({ error: "source and content required" });
    const filename = ingestRaw(source, content, metadata);
    res.json({ filename, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Ingest error" });
  }
});

/** POST /api/wiki/compile — compile a wiki page from raw files */
app.post("/api/wiki/compile", async (req, res) => {
  try {
    const { rawFiles, title } = req.body as { rawFiles: string[]; title: string };
    if (!rawFiles || !title) return res.status(400).json({ error: "rawFiles and title required" });
    const page = await compileWikiPage(rawFiles, title);
    res.json({ page, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Compile error" });
  }
});

/** POST /api/wiki/compile-all — compile all raw into wiki pages */
app.post("/api/wiki/compile-all", async (_req, res) => {
  try {
    const pages = await compileAllRaw();
    res.json({ pages, count: pages.length, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Compile error" });
  }
});

// ─── AUTORESEARCH API ─────────────────────────────────────────────────────────────
let isAutoresearchRunning = false;

/** POST /api/autoresearch/start — start autonomous loop */
app.post("/api/autoresearch/start", async (req, res) => {
  try {
    if (isAutoresearchRunning) {
      return res.status(409).json({ error: "Autoresearch is already running" });
    }

    const { repos, maxIterations } = req.body as { repos?: string[]; maxIterations?: number };
    const sourceRepos = repos ?? ["nexus-alpha/self"];

    isAutoresearchRunning = true;
    // Run async — return immediately
    runAutonomousLoop(sourceRepos, () => {}, maxIterations)
      .catch(console.error)
      .finally(() => { isAutoresearchRunning = false; });

    res.json({ started: true, repos: sourceRepos, ts: Date.now() });
  } catch (e) {
    isAutoresearchRunning = false;
    res.status(500).json({ error: e instanceof Error ? e.message : "Autoresearch start failed" });
  }
});

/** GET /api/autoresearch/status — get autoresearch state */
app.get("/api/autoresearch/status", (_req, res) => {
  try {
    const status = getAutoresearchStatus();
    res.json({ ...status, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Status error" });
  }
});

/** POST /api/autoresearch/reset — reset log */
app.post("/api/autoresearch/reset", (_req, res) => {
  try {
    resetAutoresearchLog();
    res.json({ reset: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Reset error" });
  }
});

// ─── BRAIN TOOL API ENDPOINTS ─────────────────────────────────────────────────────

/** POST /api/brain/query - Query deterministic brain */
app.post("/api/brain/query", async (req, res) => {
  const { query, lane, verbose } = req.body as { 
    query: string; 
    lane?: "coding" | "business_logic" | "agent_brain" | "tool_calling" | "cross_domain";
    verbose?: boolean;
  };

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const result = await runDeterministicBrain({ query, lane, verbose });
    res.json({ result, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/brain/browser - Run browser automation command */
app.post("/api/brain/browser", async (req, res) => {
  const { command, timeout } = req.body as { command: string; timeout?: number };

  if (!command) {
    return res.status(400).json({ error: "command is required" });
  }

  try {
    const result = await runBrowserHarness({ command, timeout });
    res.json({ result, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ─── SETTINGS / BRAIN CONTROL API ──────────────────────────────────────────────

/** GET /api/settings/brain/status — brain runtime status */
app.get("/api/settings/brain/status", async (_req, res) => {
  try {
    const status = await getBrainStatus();
    const health = await getBrainHealth();
    res.json({ ...status, brainApiReachable: !!health });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** GET /api/settings/brain/config — current lane config (from env) */
app.get("/api/settings/brain/config", (_req, res) => {
  const laneConfigs = ["coding", "business_logic", "agent_brain", "tool_calling", "cross_domain"];
  const lanes: Record<string, { provider: string; model: string; enabled: boolean }> = {};
  for (const lane of laneConfigs) {
    const ulane = lane.toUpperCase();
    lanes[lane] = {
      provider: process.env[`LLM_${ulane}_PROVIDER`] ?? "openai",
      model: process.env[`LLM_${ulane}_MODEL`] ?? "",
      enabled: process.env[`LLM_${ulane}_ENABLED`] !== "false",
    };
  }
  res.json({
    lanes,
    routerModel: process.env.ROUTER_MODEL ?? "openai/gpt-4o-mini",
    llmFallback: process.env.QWEN_MODEL_PATH || "stub mode",
  });
});

/** POST /api/settings/brain/config — update brain config (env override or API push) */
app.post("/api/settings/brain/config", async (req, res) => {
  try {
    const payload = req.body as {
      lanes?: Record<string, { provider?: string; model?: string; enabled?: boolean }>;
      routerModel?: string;
    };
    const VALID_LANES = ['CODING', 'BUSINESS_LOGIC', 'AGENT_BRAIN', 'TOOL_CALLING', 'CROSS_DOMAIN', 'DEFAULT'];
    const VALID_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'openrouter', 'xai', 'opencode'];
    const MODEL_PATTERN = /^[a-z0-9._/-]+$/i;

    if (payload.routerModel) {
      if (!MODEL_PATTERN.test(payload.routerModel)) {
        return res.status(400).json({ error: 'Invalid router model name' });
      }
      process.env.ROUTER_MODEL = payload.routerModel;
    }
    if (payload.lanes) {
      for (const [lane, cfg] of Object.entries(payload.lanes)) {
        const ulane = lane.toUpperCase();
        if (!VALID_LANES.includes(ulane)) continue;
        if (cfg.provider) {
          if (!VALID_PROVIDERS.includes(cfg.provider)) continue;
          process.env[`LLM_${ulane}_PROVIDER`] = cfg.provider;
        }
        if (cfg.model) {
          if (!MODEL_PATTERN.test(cfg.model)) continue;
          process.env[`LLM_${ulane}_MODEL`] = cfg.model;
        }
        if (cfg.enabled !== undefined) process.env[`LLM_${ulane}_ENABLED`] = String(cfg.enabled);
      }
    }
    const pushed = await updateBrainConfig(payload);
    res.json({ applied: true, brainApiUpdated: pushed });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** POST /api/settings/brain/reload — signal the brain to reload its lanes */
app.post("/api/settings/brain/reload", async (_req, res) => {
  try {
    const ok = await reloadBrain();
    res.json({ reloaded: ok });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** GET /api/settings/integrations — integration status + config */
app.get("/api/settings/integrations", async (_req, res) => {
  try {
    const status = await integrationHub.getStatus();
    res.json({ services: status, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** GET /api/settings/pipeline — pipeline configuration */
app.get('/api/settings/pipeline', (_req, res) => {
  res.json({
    buildTimeout: Number(process.env.BUILD_TIMEOUT) || 300,
    maxParallelPhases: Number(process.env.MAX_PARALLEL_PHASES) || 3,
    autoRetry: process.env.AUTO_RETRY !== 'false',
    securityDepth: process.env.SECURITY_DEPTH || 'full',
    wikiAutoCompile: process.env.WIKI_AUTO_COMPILE !== 'false',
    graphifyAutoBuild: process.env.GRAPHIFY_AUTO_BUILD !== 'false',
    toonAutoCompress: process.env.TOON_AUTO_COMPRESS !== 'false',
  });
});

/** POST /api/settings/pipeline — update pipeline config */
app.post('/api/settings/pipeline', (req, res) => {
  const { buildTimeout, maxParallelPhases, autoRetry, securityDepth, wikiAutoCompile, graphifyAutoBuild, toonAutoCompress } = req.body;
  if (buildTimeout !== undefined) process.env.BUILD_TIMEOUT = String(buildTimeout);
  if (maxParallelPhases !== undefined) process.env.MAX_PARALLEL_PHASES = String(maxParallelPhases);
  if (autoRetry !== undefined) process.env.AUTO_RETRY = String(autoRetry);
  if (securityDepth) process.env.SECURITY_DEPTH = securityDepth;
  if (wikiAutoCompile !== undefined) process.env.WIKI_AUTO_COMPILE = String(wikiAutoCompile);
  if (graphifyAutoBuild !== undefined) process.env.GRAPHIFY_AUTO_BUILD = String(graphifyAutoBuild);
  if (toonAutoCompress !== undefined) process.env.TOON_AUTO_COMPRESS = String(toonAutoCompress);
  res.json({ applied: true });
});

/** GET /api/settings/agents — agent registry */
app.get('/api/settings/agents', (_req, res) => {
  res.json({ agents: [] });
});

// ─── REAL-TIME DATA API ────────────────────────────────────────────────────────

/** GET /api/data/repos — live GitHub trending repos analyzed by DeepSeek */
app.get("/api/data/repos", async (_req, res) => {
  try {
    const repos = await fetchGitHubTrending(24);
    res.json({ repos, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** GET /api/data/videos — live YouTube AI videos */
app.get("/api/data/videos", async (_req, res) => {
  try {
    const videos = await fetchAIVideos(3, 30);
    res.json({ videos, ts: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** GET /api/nexus/progression — gamification stats, achievements, insights */
app.get("/api/nexus/progression", (_req, res) => {
  try {
    res.json({
      progression: getProgression(),
      achievements: getAchievements(),
      insights: getLearningInsights(),
      ts: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Progression error" });
  }
});

/** POST /api/nexus/track — track a gamification event */
app.post("/api/nexus/track", (req, res) => {
  try {
    const { event, data } = req.body as { event: string; data?: Record<string, unknown> };
    let result;
    switch (event) {
      case "pipeline-run": result = trackPipelineRun(Boolean(data?.success), Number(data?.repoCount) || 1); break;
      case "repo-scan": result = trackRepoScan(); break;
      case "search": result = trackSearch(); break;
      default: return res.status(400).json({ error: `Unknown event: ${event}` });
    }
    res.json({ progression: result, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Track error" });
  }
});

// ─── ERROR TRACKING API ──────────────────────────────────────────────────────────

/** GET /api/nexus/errors — get error stats and recent errors */
app.get("/api/nexus/errors", (_req, res) => {
  try {
    res.json({
      stats: getErrorStats(),
      recent: getRecentErrors(),
      ts: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Error stats error" });
  }
});

/** POST /api/nexus/errors/track — track a new error */
app.post("/api/nexus/errors/track", (req, res) => {
  try {
    const { message, phase, context } = req.body as { message: string; phase: string; context?: Record<string, unknown> };
    if (!message || !phase) {
      return res.status(400).json({ error: "message and phase required" });
    }
    const error = trackError(message, phase, context);
    const action = getRecommendedRecovery(message);
    res.json({ error, recommendedRecovery: action, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Track error" });
  }
});

/** POST /api/nexus/errors/resolve — resolve a tracked error */
app.post("/api/nexus/errors/resolve", (req, res) => {
  try {
    const { errorId, action } = req.body as { errorId: string; action?: string };
    if (!errorId) return res.status(400).json({ error: "errorId required" });
    const result = resolveError(errorId, action as any);
    if (!result) return res.status(404).json({ error: "Error not found" });
    res.json({ error: result, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Resolve error" });
  }
});

/** GET /api/nexus/errors/recovery — get recovery patterns */
app.get("/api/nexus/errors/recovery", (_req, res) => {
  try {
    res.json({ patterns: getRecoveryPatterns(), ts: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Recovery error" });
  }
});

/** GET /api/local-infra — status of Docker-free local infrastructure */
app.get("/api/local-infra", (_req, res) => {
  res.json(getLocalInfraStatus());
});

/** GET /api/nexus/suggestions — active + history suggestions from recursive learning */
app.get("/api/nexus/suggestions", (_req, res) => {
  try {
    res.json({ active: getActiveSuggestions(), history: getSuggestionHistory() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Suggestions error" });
  }
});

/** POST /api/vibe/check — run quality gates and return build score */
app.post("/api/vibe/check", async (req, res) => {
  try {
    const { repoCount = 1, durationMs = 0 } = req.body as { repoCount?: number; durationMs?: number };
    const score = await runQualityGates(repoCount, durationMs);
    res.json(score);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Quality check error" });
  }
});

/** GET /api/vibe/history — build history, trends, insights */
app.get("/api/vibe/history", (_req, res) => {
  res.json(getBuildHistory());
});

/** GET /api/vibe/latest — latest build score */
app.get("/api/vibe/latest", (_req, res) => {
  const score = getLatestScore();
  if (!score) return res.status(404).json({ error: "No builds scored yet" });
  res.json(score);
});

/** GET /api/vibe/gates — quality gate definitions */
app.get("/api/vibe/gates", (_req, res) => {
  res.json(GATE_DEFINITIONS);
});

/** GET /api/graphify/summary — knowledge graph overview */
app.get("/api/graphify/summary", (_req, res) => {
  res.json({ summary: getGraphSummary(), available: graphAvailable() });
});

/** GET /api/graphify/query — search the knowledge graph */
app.get("/api/graphify/query", (req, res) => {
  const q = (req.query.q as string) || "";
  if (!q) return res.status(400).json({ error: "?q= required" });
  const nodes = queryGraph(q);
  res.json({ query: q, results: nodes, count: nodes.length, available: graphAvailable() });
});

/** POST /api/toon/compress — compress JSON to TOON format */
app.post("/api/toon/compress", (req, res) => {
  try {
    const { content, aggressive } = req.body as { content: string; aggressive?: boolean };
    if (!content) return res.status(400).json({ error: "content required" });
    const result = encodeToToon(content, { aggressive });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Compression error" });
  }
});

/** GET /api/toon/stats — token savings statistics */
app.get("/api/toon/stats", (_req, res) => {
  res.json(getToonStats());
});

// ─── CODING AGENT API ─────────────────────────────────────────────────────────────

import { codingAgent } from "../core/agents/codingAgentService";
import { realPipeline } from "../core/agents/realPipeline";
import { deploy, checkDeployAvailability } from "../core/agents/deployer";

/** POST /api/coding-agent/generate — Generate a full application from a prompt */
app.post("/api/coding-agent/generate", strictLimiter, async (req, res) => {
  try {
    const spec = req.body as import("../coding-agent/types").AppSpec;
    if (!spec || !spec.description) {
      return res.status(400).json({ error: "description is required" });
    }

    const result = await codingAgent.generateApp(spec);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Generation failed" });
  }
});

/** GET /api/coding-agent/apps — List all generated apps */
app.get("/api/coding-agent/apps", (_req, res) => {
  try {
    const apps = codingAgent.listGeneratedApps();
    res.json({ apps, count: apps.length });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "List failed" });
  }
});

/** POST /api/coding-agent/cleanup?maxAgeHours=24 — Remove old generated apps */
app.post("/api/coding-agent/cleanup", (req, res) => {
  try {
    const maxAgeHours = parseInt(req.query.maxAgeHours as string, 10) || 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const result = codingAgent.cleanup(maxAgeMs);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Cleanup failed" });
  }
});

/** POST /api/deploy — Deploy a generated app */
app.post("/api/deploy", strictLimiter, async (req, res) => {
  try {
    const { appDir, target, appName, port } = req.body as {
      appDir: string; target: string; appName?: string; port?: number;
    };
    if (!appDir || !target) return res.status(400).json({ error: "appDir and target required" });

    // Fix Issue #14: appDir containment check
    const resolvedAppDir = path.resolve(appDir);
    const uploadsPath = path.resolve(path.join(process.cwd(), "uploads"));
    if (!resolvedAppDir.startsWith(uploadsPath)) {
       return res.status(403).json({ error: "Access denied. appDir must be within uploads/." });
    }

    const validTargets = ["docker", "vercel", "netlify", "zip"];
    if (!validTargets.includes(target)) {
      return res.status(400).json({ error: `Invalid target. Choose: ${validTargets.join(", ")}` });
    }

    const result = await deploy({
      target: target as any,
      appName: appName || path.basename(appDir),
      appDir,
      port,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Deploy failed" });
  }
});

/** GET /api/deploy/availability — Check which deployment targets are available */
app.get("/api/deploy/availability", (_req, res) => {
  try {
    const avail = checkDeployAvailability();
    res.json(avail);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Check failed" });
  }
});

/** POST /api/pipeline/generate — Generate app + run real pipeline phases */
app.post("/api/pipeline/generate", strictLimiter, async (req, res) => {
  try {
    const spec = req.body as import("../coding-agent/types").AppSpec;
    if (!spec || !spec.description) {
      return res.status(400).json({ error: "description is required" });
    }

    const result = await realPipeline.run(spec);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Pipeline generation failed" });
  }
});

/** GET /api/coding-agent/app/:dir — Get info about a specific generated app */
app.get("/api/coding-agent/app/:dir", strictLimiter, (req, res) => {
  try {
    const { dir } = req.params;
    const appDir = path.resolve(path.join(
      process.cwd(),
      "uploads",
      "generated-apps",
      path.basename(dir),
    ));
    const info = codingAgent.getAppInfo(appDir);
    if (!info.exists) return res.status(404).json({ error: "App not found" });
    res.json({ ...info, dir });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Info failed" });
  }
});

/** POST /api/composer/generate - Multi-agent synthesis endpoint */
app.post("/api/composer/generate", strictLimiter, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });
    
    // Call Gemini to act as a Multi-Agent synthesis orchestrator
    // For this prototype, we return a simulated diff based on the prompt.
    // A real implementation would parse the codebase and propose AST-level diffs.
    
    // Wait for ultraPlan to simulate deep thinking
    const ultraPlan = await import("../services/ultraPlan").then(m => m.executeUltraPlan(prompt, ["local-workspace"]));

    res.json({
      success: true,
      plan: ultraPlan,
      lore: `I implemented a consolidated async runner in ${prompt.includes('service') ? 'the requested service' : 'refactor_script.js'} to improve non-blocking I/O performance. I avoided a standard loop to prevent Event Loop starvation during heavy workloads.`,
      changes: [
        {
          id: Math.random().toString(36).slice(2),
          filePath: 'refactor_script.js',
          originalContent: '// Add your code here',
          newContent: `// Auto-generated by KAIROS & Composer\n// Task: ${prompt}\nconsole.log("Refactored by Nexus-Alpha Agents");`,
          status: 'pending'
        }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/composer/apply - Apply a specific code change to disk */
app.post("/api/composer/apply", strictLimiter, async (req, res) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: "Missing filePath or content" });
    
    const fullPath = path.resolve(process.cwd(), filePath);
    // Security check: ensure path is within workspace
    if (!fullPath.startsWith(process.cwd())) {
      return res.status(403).json({ error: "Forbidden: Path outside workspace" });
    }
    
    const fs = await import("fs/promises");
    await fs.writeFile(fullPath, content, "utf-8");
    
    console.log("[Composer] Applied change to", filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/tools/debt - Analyze technical debt in a file */
app.post("/api/tools/debt", strictLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: "Missing content" });
    const { getDebtRadar } = await import("../services/staticAnalysisService");
    const radar = getDebtRadar(content);
    res.json(radar);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/pipeline/logs/:id — Fetch persistent execution logs */
app.get("/api/pipeline/logs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const logData = await getExecutionLog(id);
    if (!logData) return res.status(404).json({ error: "Logs not found" });
    res.json(logData);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

/** GET /api/pipeline/prs — List all automated PRs */
app.get("/api/pipeline/prs", async (_req, res) => {
  try {
    const prs = await listPullRequests();
    res.json(prs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch PRs" });
  }
});

/** POST /api/pipeline/prs/:id/hunks/:hunkId — Update hunk status */
app.post("/api/pipeline/prs/:id/hunks/:hunkId", async (req, res) => {
  try {
    const { id, hunkId } = req.params;
    const { status } = req.body as { status: 'approved' | 'rejected' };
    const updatedPr = await updateHunkStatus(id, hunkId, status);
    if (!updatedPr) return res.status(404).json({ error: "PR or hunk not found" });
    res.json(updatedPr);
  } catch (err) {
    res.status(500).json({ error: "Failed to update hunk" });
  }
});

/** GET /api/audit/logs — Fetch system audit logs */
app.get("/api/audit/logs", async (_req, res) => {
  try {
    const logs = await getAuditLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────────
(async () => {
  const queueReady = await initPipelineQueue();
  console.log(`[Q] BullMQ pipeline queue ${queueReady ? 'connected' : 'unavailable (simulated mode)'}`);

  // Fix Issue #13: Production API Key check
  if (process.env.NODE_ENV === 'production' && (!process.env.NEXUS_API_KEY || process.env.NEXUS_API_KEY === 'nexus-alpha-dev-key')) {
    console.error('[CRITICAL] NEXUS_API_KEY must be set to a secure value in production.');
    process.exit(1);
  }

  await initLogService();
  console.log('[L] Log persistence service initialized');

  await initAuditService();
  console.log('[A] System audit service initialized');

  await startLocalInfra();
  const infra = getLocalInfraStatus();
  console.log(`[I] Local infra mode: ${infra.mode} (${infra.qdrant.collections.length} collections, ${infra.qdrant.vectors} vectors)`);

  httpServer.listen(PORT_HTTP, () => {
    console.log(`[HTTP] Nexus Alpha server running on port ${PORT_HTTP}`);
    
    // Start the Nexus Always-On Autonomous Daemon
    import("../services/kairosDaemon").then(({ kairosDaemon }) => {
      kairosDaemon.start();
    });

    console.log(`[WS]   WebSocket endpoint ready at ws://localhost:${PORT_HTTP}/ws`);
    if (process.env.WS_PORT && Number(process.env.WS_PORT) !== PORT_HTTP) {
      console.log(`[WS]   Ignoring legacy WS_PORT=${PORT_WS}; WebSocket now shares the HTTP server.`);
    }
  });
})();

process.on('SIGTERM', async () => {
  console.log('[SIGTERM] Shutting down...');
  wsServer.close(() => {});
  stopLocalInfra();
  await shutdownPipelineQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  wsServer.close(() => {});
  stopLocalInfra();
  await shutdownPipelineQueue();
  process.exit(0);
});

export { app, broadcast };
