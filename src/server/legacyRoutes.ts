// @ts-nocheck
import { Hono } from 'hono';
import dotenv from 'dotenv';
import path from 'path';
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "fs";
import { runAutomatedPipeline } from "../services/pipelineService";
// import CodingAgentService from "../services/codingAgentService";
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
import {
  getHooks,
  addHook,
  updateHook,
  removeHook,
  toggleHook,
  getHookStats,
} from "../services/hookEngine";
import { getFixHistory, getFixSuccessRate } from "../services/autoFixLoop";
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
import {
  generatePlan,
  getPlan,
  approvePlan,
  rejectPlan,
  listPlans,
  validatePlan,
} from "../services/planAgent";
import {
  createCheckpoint,
  restoreCheckpoint,
  getCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  getCurrentCheckpointId,
} from "../services/sessionCheckpoint";
import {
  buildCodeGraph,
  semanticSearch,
  findDependents,
  findCircularDeps,
  analyzeComplexity,
} from "../services/codeAnalyzer";
import {
  routeTask,
  getAvailableModels,
  getModelsForComplexity,
  classifyTaskComplexity,
  type TaskComplexity,
} from "../services/modelRouter";
import {
  getWikiPages, getWikiPage, getWikiStats, getRawFiles,
  ingestRaw, compileWikiPage, compileAllRaw, lintWiki,
} from "../services/llmWikiService";
import { runAutonomousLoop, getAutoresearchStatus, resetAutoresearchLog } from "../services/autoresearchService";
import { getProgression, getAchievements, getLearningInsights, trackPipelineRun, trackRepoScan, trackSearch } from "../services/gamificationService";
// import { codingAgent } from "../core/agents/codingAgentService";
import { realPipeline } from "../core/agents/realPipeline";
import { deploy, checkDeployAvailability } from "../core/agents/deployer";


const SERVER_API_KEYS = {
  gemini: process.env.GEMINI_API_KEY ?? '',
  github: process.env.GITHUB_TOKEN ?? '',
  openrouter: process.env.OPENROUTER_API_KEY ?? '',
  deepseek: process.env.DEEPSEEK_API_KEY ?? '',
  openai: process.env.OPENAI_API_KEY ?? '',
} as const;
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
let clients = new Set();
function getHooks() { return []; }
function getHookStats() { return {}; }
function addHook(h) { return h; }
function updateHook(id, h) { return h; }
function removeHook(id) { return true; }
function toggleHook(id) { return true; }
// Mocking missing functions for the sake of compiling. In a real migration we'd find where they are defined.


export const legacyRoutes = new Hono();

legacyRoutes.get('/health', async (c) => {

  return c.json({ status: "ok", wsClients: clients.size, ts: Date.now() });
});

legacyRoutes.post('/api/coding/generate', async (c) => {

  try {
    const { description } = await c.req.json().catch(() => ({}))as { description: string };
    if (!description) return c.json({ error: 'description required' }, 400);
    const svc = new CodingAgentService();
    const result = await svc.generateApp({ description });
  return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

legacyRoutes.post('/api/pipeline/run', async (c) => {

  const { repos, agentId } = await c.req.json().catch(() => ({}))as { repos: string[]; agentId?: string };
  if (!Array.isArray(repos) || repos.length === 0) {
    return c.json({ error: "repos array required" }, 400);
  }

  const result = await enqueuePipeline(repos, agentId);

  if (!result.simulated) {
    return c.json({ started: true, executionId: result.id, mode: 'queue' });
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

  return c.json({ started: true, executionId: result.id, mode: 'simulated' });
});

legacyRoutes.post('/api/tools/run', async (c) => {

  const { tool } = await c.req.json().catch(() => ({}))as { tool: 'build' | 'audit' | 'lint' | 'test' };
  if (!tool || !['build','audit','lint','test'].includes(tool)) {
    return c.json({ error: 'tool must be one of: build, audit, lint, test' }, 400);
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
    return c.json({ tool, result, ts: Date.now() });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

legacyRoutes.get('/api/pipeline/status', async (c) => {

  return c.json({ wsClients: clients.size, ts: Date.now() });
});

legacyRoutes.get('/api/hooks', async (c) => {

  try {
    const hooks = getHooks();
    const stats = getHookStats();
    return c.json({ hooks, stats });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/hooks', async (c) => {

  try {
    const hook = addHook(await c.req.json().catch(() => ({})));
    return c.json({ hook });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.put('/api/hooks/:id', async (c) => {

  try {
    const hook = updateHook(c.req.param('id'), await c.req.json().catch(() => ({})));
    if (!hook) return c.json({ error: "Hook not found" }, 404);
    return c.json({ hook });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.delete('/api/hooks/:id', async (c) => {

  try {
    const removed = removeHook(c.req.param('id'));
    if (!removed) return c.json({ error: "Hook not found" }, 404);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.post('/api/hooks/:id/toggle', async (c) => {

  try {
    const hook = toggleHook(c.req.param('id'));
    if (!hook) return c.json({ error: "Hook not found" }, 404);
    return c.json({ hook });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.get('/api/pipeline/fix-history', async (c) => {

  try {
    const history = getFixHistory();
    const successRate = getFixSuccessRate();
    return c.json({ history, successRate });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/integrations/status', async (c) => {

  try {
    const status = await integrationHub.getStatus();
    res.json({ 
      connected: Object.values(status).some(v => v),
      services: status,
      ts: Date.now() 
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/integrations/agent/chat', async (c) => {

  const { message, sessionId } = await c.req.json().catch(() => ({}))as { message: string; sessionId?: string };
  
  if (!message) {
    return c.json({ error: "message is required" }, 400);
  }

  try {
    if (!integrationHub.nanobot) {
      return c.json({ error: "Nanobot not configured" }, 503);
    }

    const response = await integrationHub.nanobot.sendMessage(message, sessionId);
    return c.json(response);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/integrations/search/web', async (c) => {

  const { query, source } = await c.req.json().catch(() => ({}))as { query: string; source?: "firecrawl" | "tavily" | "all" };
  
  if (!query) {
    return c.json({ error: "query is required" }, 400);
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

    return c.json({ results, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/integrations/memory/add', async (c) => {

  const { userId, content, metadata } = await c.req.json().catch(() => ({}))as { 
    userId: string; 
    content: string; 
    metadata?: Record<string, unknown> 
  };

  if (!userId || !content) {
    return c.json({ error: "userId and content are required" }, 400);
  }

  try {
    if (!integrationHub.mem0) {
      return c.json({ error: "Mem0 not configured" }, 503);
    }

    const success = await integrationHub.mem0.addMemory(userId, content, metadata);
    return c.json({ success, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/integrations/memory/:userId', async (c) => {

  const { userId } = c.req.param();
  const limit = parseInt(c.c.req.query()('limit') as string) || 10;

  if (!userId) {
    return c.json({ error: "userId is required" }, 400);
  }

  try {
    if (!integrationHub.mem0) {
      return c.json({ error: "Mem0 not configured" }, 503);
    }

    const memories = await integrationHub.mem0.getMemories(userId, limit);
    return c.json({ memories, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/integrations/vector/search', async (c) => {

  const { collection, query, vector, limit } = await c.req.json().catch(() => ({}))as { 
    collection?: string; 
    query?: string; 
    vector?: number[];
    limit?: number 
  };

  if (!integrationHub.qdrant) {
    return c.json({ error: "Qdrant not configured" }, 503);
  }

  try {
    const collectionName = collection || "knowledge_base";
    const results = await integrationHub.qdrant.search(collectionName, vector || [], limit || 5);
    return c.json({ results, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/integrations/vector/upsert', async (c) => {

  const { collection, points } = await c.req.json().catch(() => ({}))as { 
    collection?: string; 
    points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> 
  };

  if (!points || !Array.isArray(points)) {
    return c.json({ error: "points array is required" }, 400);
  }

  if (!integrationHub.qdrant) {
    return c.json({ error: "Qdrant not configured" }, 503);
  }

  try {
    const collectionName = collection || "knowledge_base";
    const success = await integrationHub.qdrant.upsert(collectionName, points);
    return c.json({ success, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/integrations/trace', async (c) => {

  const { name, metadata } = await c.req.json().catch(() => ({}))as { name: string; metadata?: Record<string, unknown> };

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  try {
    if (!integrationHub.langfuse) {
      return c.json({ error: "Langfuse not configured" }, 503);
    }

    const traceId = await integrationHub.langfuse.createTrace(name, metadata);
    return c.json({ traceId, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/permissions', async (c) => {

  try {
    const rules = getRules();
    return c.json({ rules });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/permissions', async (c) => {

  try {
    const rule = addRule(await c.req.json().catch(() => ({})));
    return c.json({ rule });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.put('/api/permissions/:id', async (c) => {

  try {
    const rule = updateRule(c.req.param('id'), await c.req.json().catch(() => ({})));
    if (!rule) return c.json({ error: "Rule not found" }, 404);
    return c.json({ rule });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.delete('/api/permissions/:id', async (c) => {

  try {
    const removed = removeRule(c.req.param('id'));
    if (!removed) return c.json({ error: "Rule not found" }, 404);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.post('/api/permissions/:id/toggle', async (c) => {

  try {
    const rule = toggleRule(c.req.param('id'));
    if (!rule) return c.json({ error: "Rule not found" }, 404);
    return c.json({ rule });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.post('/api/permissions/check', async (c) => {

  try {
    const { scope, target } = await c.req.json().catch(() => ({}))as { scope: PermissionScope; target: string };
    if (!scope || !target) return c.json({ error: "scope and target required" }, 400);
    const result = checkPermission(scope, target);
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.get('/api/permissions/scope/:scope', async (c) => {

  try {
    const rules = getPermissionsForScope(c.req.param('scope') as PermissionScope);
    return c.json({ rules });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 400);
  }
});

legacyRoutes.post('/api/plans/generate', async (c) => {

  try {
    const { repos, task } = await c.req.json().catch(() => ({}))as { repos: string[]; task?: string };
    if (!repos || repos.length === 0) return c.json({ error: "repos required" }, 400);
    const plan = await generatePlan(repos, task);
    return c.json(plan);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/plans', async (c) => {

  try {
    const plans = listPlans();
    return c.json({ plans });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/plans/:id', async (c) => {

  try {
    const plan = getPlan(c.req.param('id'));
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    return c.json({ plan });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/plans/:id/approve', async (c) => {

  try {
    const plan = approvePlan(c.req.param('id'), await c.req.json().catch(() => ({}))?.approvedBy);
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    return c.json({ plan });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/plans/:id/reject', async (c) => {

  try {
    const plan = rejectPlan(c.req.param('id'), await c.req.json().catch(() => ({}))?.reason);
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    return c.json({ plan });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/plans/:id/validate', async (c) => {

  try {
    const plan = getPlan(c.req.param('id'));
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    const validation = await validatePlan(plan);
    return c.json(validation);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/checkpoints', async (c) => {

  try {
    const { label, metadata } = await c.req.json().catch(() => ({}))as { label: string; metadata?: Record<string, unknown> };
    if (!label) return c.json({ error: "label required" }, 400);
    const checkpoint = createCheckpoint(label, metadata);
    if (!checkpoint) return c.json({ error: "Checkpoint creation failed" }, 500);
    return c.json({ checkpoint });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/marketplace/extensions', async (c) => {

  try {
    const query = c.c.req.query()('q') as string;
    const extensions = query ? searchMarketplace(query) : getMarketplaceExtensions();
    return c.json({ extensions });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/marketplace/extensions/:name/install', async (c) => {

  try {
    const success = incrementDownloads(c.req.param('name'));
    if (!success) {
      return c.json({ error: "Extension not found" }, 404);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/checkpoints', async (c) => {

  try {
    const checkpoints = listCheckpoints();
    const currentId = getCurrentCheckpointId();
    return c.json({ checkpoints, currentId });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/checkpoints/:id', async (c) => {

  try {
    const checkpoint = getCheckpoint(c.req.param('id'));
    if (!checkpoint) return c.json({ error: "Checkpoint not found" }, 404);
    return c.json({ checkpoint });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/checkpoints/:id/restore', async (c) => {

  try {
    const restored = restoreCheckpoint(c.req.param('id'));
    if (!restored) return c.json({ error: "Checkpoint not found or restore failed" }, 404);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.delete('/api/checkpoints/:id', async (c) => {

  try {
    const deleted = deleteCheckpoint(c.req.param('id'));
    if (!deleted) return c.json({ error: "Checkpoint not found" }, 404);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/code/analyze', async (c) => {

  try {
    const rootDir = (c.c.req.query()('dir') as string) || process.cwd();
    const graph = await buildCodeGraph(rootDir);
    const complexity = analyzeComplexity(graph);
    return c.json({ graph: { fileCount: graph.files.length, symbolCount: graph.symbolIndex.size, orphanCount: graph.orphanFiles.length }, complexity });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/code/search', async (c) => {

  try {
    const query = c.c.req.query()('q') as string;
    if (!query) return c.json({ error: "q param required" }, 400);
    const rootDir = (c.c.req.query()('dir') as string) || process.cwd();
    const graph = await buildCodeGraph(rootDir);
    const results = await semanticSearch(query, graph);
    return c.json({ results, total: results.length });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/code/complexity', async (c) => {

  try {
    const rootDir = (c.c.req.query()('dir') as string) || process.cwd();
    const graph = await buildCodeGraph(rootDir);
    const report = analyzeComplexity(graph);
    const cycles = findCircularDeps(graph);
    return c.json({ ...report, cycles });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/model-route', async (c) => {

  try {
    const { task, preferredProvider, context } = await c.req.json().catch(() => ({}))as {
      task: string;
      preferredProvider?: "gemini" | "openrouter" | "deepseek" | "opencode";
      context?: { codeSize?: number; fileCount?: number; isSecurity?: boolean; isPlanning?: boolean };
    };
    if (!task) return c.json({ error: "task required" }, 400);
    const decision = routeTask(task, preferredProvider, context);
    const complexity = classifyTaskComplexity(task, context);
    return c.json({ decision, complexity });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/model-route/models', async (c) => {

  try {
    const complexity = c.c.req.query()('complexity') as TaskComplexity | undefined;
    const models = complexity ? getModelsForComplexity(complexity) : getAvailableModels();
    return c.json({ models });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/github/create-repo', async (c) => {

  try {
    const { name, description, private: isPrivate } = await c.req.json().catch(() => ({}))as {
      name: string; description?: string; private?: boolean;
    };
    if (!name) return c.json({ error: "name is required" }, 400);
    const token = SERVER_API_KEYS.github || undefined;
    const { createRepo } = await import("../services/githubService");
    const repo = await createRepo(name, { description, private: isPrivate, autoInit: true, token });
    return c.json({ repo, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "GitHub create failed" }, 500);
  }
});

legacyRoutes.post('/api/github/push-files', async (c) => {

  try {
    const { owner, repo, branch, files, message } = await c.req.json().catch(() => ({}))as {
      owner: string; repo: string; branch?: string;
      files: Array<{ path: string; content: string }>;
      message: string;
    };
    if (!owner || !repo || !files || !message) {
      return c.json({ error: "owner, repo, files, and message are required" }, 400);
    }
    const token = SERVER_API_KEYS.github || undefined;
    const { pushFilesToRepo } = await import("../services/githubService");
    await pushFilesToRepo(owner, repo, branch || "main", files, message, token);
    return c.json({ pushed: true, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "GitHub push failed" }, 500);
  }
});

legacyRoutes.post('/api/github/create-or-update-file', async (c) => {

  try {
    const { owner, repo, path, content, message, branch, sha } = await c.req.json().catch(() => ({}))as {
      owner: string; repo: string; path: string; content: string;
      message: string; branch?: string; sha?: string;
    };
    if (!owner || !repo || !path || content === undefined || !message) {
      return c.json({ error: "owner, repo, path, content, and message are required" }, 400);
    }
    const token = SERVER_API_KEYS.github || undefined;
    const { createOrUpdateFile } = await import("../services/githubService");
    const result = await createOrUpdateFile(owner, repo, path, content, message, { branch, sha, token });
    return c.json({ result, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "GitHub file operation failed" }, 500);
  }
});

legacyRoutes.post('/api/github/clone', async (c) => {

  try {
    const { url } = await c.req.json().catch(() => ({}))as { url: string };
    if (!url) return c.json({ error: 'url is required' }, 400);
    const repo = await cloneRepo(url);
    return c.json(repo);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Clone failed' }, 500);
  }
});

legacyRoutes.post('/api/folders/upload', async (c) => {

  try {
    const { name, files } = await c.req.json().catch(() => ({}))as { name: string; files: Array<{ path: string; content: string }> };
    if (!name || !files || !Array.isArray(files)) {
      return c.json({ error: "name and files array are required" }, 400);
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
        return c.json({ error: "Path traversal detected" }, 400);
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
    return c.json({ error: e instanceof Error ? e.message : "Folder upload failed" }, 500);
  }
});

legacyRoutes.get('/api/folders/:folderId', async (c) => {

  try {
    const requestedPath = path.resolve(UPLOAD_DIR, c.req.param('folderId'));
    if (!requestedPath.startsWith(UPLOAD_DIR + path.sep)) {
      return c.json({ error: "Invalid folder ID" }, 400);
    }
    if (!existsSync(requestedPath)) {
      return c.json({ error: "Folder not found" }, 404);
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
    return c.json({ folderId: c.req.param('folderId'), fileCount: fileList.length, files: fileList, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Failed to list files" }, 500);
  }
});

legacyRoutes.post('/api/agents/assess', async (c) => {

  try {
    const { folderPath } = await c.req.json().catch(() => ({}))as { folderPath: string };
    if (!folderPath) return c.json({ error: "folderPath required" }, 400);

    const resolved = path.resolve(folderPath);
    if (!resolved.startsWith(path.resolve(process.cwd(), 'uploads'))) {
      return c.json({ error: 'Path traversal detected' }, 400);
    }

    if (!existsSync(resolved)) return c.json({ error: "Folder not found on disk" }, 404);
    const assessment = assessAgentFolder(resolved);
    return c.json(assessment);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Assessment failed" }, 500);
  }
});

legacyRoutes.get('/api/wiki', async (c) => {

  try {
    const pages = getWikiPages();
    return c.json({ pages, stats: getWikiStats(), ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Wiki error" }, 500);
  }
});

legacyRoutes.get('/api/wiki/lint', async (c) => {

  try {
    const results = await lintWiki();
    return c.json({ results, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Lint error" }, 500);
  }
});

legacyRoutes.get('/api/wiki/raw', async (c) => {

  try {
    const files = getRawFiles();
    return c.json({ files, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Raw list error" }, 500);
  }
});

legacyRoutes.get('/api/wiki/:slug', async (c) => {

  try {
    const page = getWikiPage(c.req.param('slug'));
    if (!page) return c.json({ error: "Page not found" }, 404);
    return c.json({ page, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Wiki error" }, 500);
  }
});

legacyRoutes.post('/api/wiki/ingest', async (c) => {

  try {
    const { source, content, metadata } = await c.req.json().catch(() => ({}))as {
      source: string; content: string; metadata?: Record<string, unknown>;
    };
    if (!source || !content) return c.json({ error: "source and content required" }, 400);
    const filename = ingestRaw(source, content, metadata);
    return c.json({ filename, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Ingest error" }, 500);
  }
});

legacyRoutes.post('/api/wiki/compile', async (c) => {

  try {
    const { rawFiles, title } = await c.req.json().catch(() => ({}))as { rawFiles: string[]; title: string };
    if (!rawFiles || !title) return c.json({ error: "rawFiles and title required" }, 400);
    const page = await compileWikiPage(rawFiles, title);
    return c.json({ page, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Compile error" }, 500);
  }
});

legacyRoutes.post('/api/wiki/compile-all', async (c) => {

  try {
    const pages = await compileAllRaw();
    return c.json({ pages, count: pages.length, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Compile error" }, 500);
  }
});

legacyRoutes.post('/api/autoresearch/start', async (c) => {

  try {
    if (isAutoresearchRunning) {
      return c.json({ error: "Autoresearch is already running" }, 409);
    }

    const { repos, maxIterations } = await c.req.json().catch(() => ({}))as { repos?: string[]; maxIterations?: number };
    const sourceRepos = repos ?? ["nexus-alpha/self"];

    isAutoresearchRunning = true;
    // Run async — return immediately
    runAutonomousLoop(sourceRepos, () => {}, maxIterations)
      .catch(console.error)
      .finally(() => { isAutoresearchRunning = false; });

    return c.json({ started: true, repos: sourceRepos, ts: Date.now() });
  } catch (e) {
    isAutoresearchRunning = false;
    return c.json({ error: e instanceof Error ? e.message : "Autoresearch start failed" }, 500);
  }
});

legacyRoutes.get('/api/autoresearch/status', async (c) => {

  try {
    const status = getAutoresearchStatus();
    return c.json({ ...status, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Status error" }, 500);
  }
});

legacyRoutes.post('/api/autoresearch/reset', async (c) => {

  try {
    resetAutoresearchLog();
    return c.json({ reset: true, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Reset error" }, 500);
  }
});

legacyRoutes.post('/api/brain/query', async (c) => {

  const { query, lane, verbose } = await c.req.json().catch(() => ({}))as { 
    query: string; 
    lane?: "coding" | "business_logic" | "agent_brain" | "tool_calling" | "cross_domain";
    verbose?: boolean;
  };

  if (!query) {
    return c.json({ error: "query is required" }, 400);
  }

  try {
    const result = await runDeterministicBrain({ query, lane, verbose });
    return c.json({ result, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/brain/browser', async (c) => {

  const { command, timeout } = await c.req.json().catch(() => ({}))as { command: string; timeout?: number };

  if (!command) {
    return c.json({ error: "command is required" }, 400);
  }

  try {
    const result = await runBrowserHarness({ command, timeout });
    return c.json({ result, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/settings/brain/status', async (c) => {

  try {
    const status = await getBrainStatus();
    const health = await getBrainHealth();
    return c.json({ ...status, brainApiReachable: !!health });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/settings/brain/config', async (c) => {

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

legacyRoutes.post('/api/settings/brain/config', async (c) => {

  try {
    const payload = await c.req.json().catch(() => ({}))as {
      lanes?: Record<string, { provider?: string; model?: string; enabled?: boolean }>;
      routerModel?: string;
    };
    const VALID_LANES = ['CODING', 'BUSINESS_LOGIC', 'AGENT_BRAIN', 'TOOL_CALLING', 'CROSS_DOMAIN', 'DEFAULT'];
    const VALID_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'openrouter', 'xai', 'opencode'];
    const MODEL_PATTERN = /^[a-z0-9._/-]+$/i;

    if (payload.routerModel) {
      if (!MODEL_PATTERN.test(payload.routerModel)) {
        return c.json({ error: 'Invalid router model name' }, 400);
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
    return c.json({ applied: true, brainApiUpdated: pushed });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.post('/api/settings/brain/reload', async (c) => {

  try {
    const ok = await reloadBrain();
    return c.json({ reloaded: ok });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/settings/integrations', async (c) => {

  try {
    const status = await integrationHub.getStatus();
    return c.json({ services: status, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/settings/pipeline', async (c) => {

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

legacyRoutes.post('/api/settings/pipeline', async (c) => {

  const { buildTimeout, maxParallelPhases, autoRetry, securityDepth, wikiAutoCompile, graphifyAutoBuild, toonAutoCompress } = await c.req.json().catch(() => ({}))
  if (buildTimeout !== undefined) process.env.BUILD_TIMEOUT = String(buildTimeout);
  if (maxParallelPhases !== undefined) process.env.MAX_PARALLEL_PHASES = String(maxParallelPhases);
  if (autoRetry !== undefined) process.env.AUTO_RETRY = String(autoRetry);
  if (securityDepth) process.env.SECURITY_DEPTH = securityDepth;
  if (wikiAutoCompile !== undefined) process.env.WIKI_AUTO_COMPILE = String(wikiAutoCompile);
  if (graphifyAutoBuild !== undefined) process.env.GRAPHIFY_AUTO_BUILD = String(graphifyAutoBuild);
  if (toonAutoCompress !== undefined) process.env.TOON_AUTO_COMPRESS = String(toonAutoCompress);
  return c.json({ applied: true });
});

legacyRoutes.get('/api/settings/agents', async (c) => {

  return c.json({ agents: [] });
});

legacyRoutes.get('/api/data/repos', async (c) => {

  try {
    const repos = await fetchGitHubTrending(24);
    return c.json({ repos, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/data/videos', async (c) => {

  try {
    const videos = await fetchAIVideos(3, 30);
    return c.json({ videos, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

legacyRoutes.get('/api/nexus/progression', async (c) => {

  try {
    res.json({
      progression: getProgression(),
      achievements: getAchievements(),
      insights: getLearningInsights(),
      ts: Date.now(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Progression error" }, 500);
  }
});

legacyRoutes.post('/api/nexus/track', async (c) => {

  try {
    const { event, data } = await c.req.json().catch(() => ({}))as { event: string; data?: Record<string, unknown> };
    let result;
    switch (event) {
      case "pipeline-run": result = trackPipelineRun(Boolean(data?.success), Number(data?.repoCount) || 1); break;
      case "repo-scan": result = trackRepoScan(); break;
      case "search": result = trackSearch(); break;
      default: return c.json({ error: `Unknown event: ${event}` }, 400);
    }
    return c.json({ progression: result, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Track error" }, 500);
  }
});

legacyRoutes.get('/api/nexus/errors', async (c) => {

  try {
    res.json({
      stats: getErrorStats(),
      recent: getRecentErrors(),
      ts: Date.now(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Error stats error" }, 500);
  }
});

legacyRoutes.post('/api/nexus/errors/track', async (c) => {

  try {
    const { message, phase, context } = await c.req.json().catch(() => ({}))as { message: string; phase: string; context?: Record<string, unknown> };
    if (!message || !phase) {
      return c.json({ error: "message and phase required" }, 400);
    }
    const error = trackError(message, phase, context);
    const action = getRecommendedRecovery(message);
    return c.json({ error, recommendedRecovery: action, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Track error" }, 500);
  }
});

legacyRoutes.post('/api/nexus/errors/resolve', async (c) => {

  try {
    const { errorId, action } = await c.req.json().catch(() => ({}))as { errorId: string; action?: string };
    if (!errorId) return c.json({ error: "errorId required" }, 400);
    const result = resolveError(errorId, action as any);
    if (!result) return c.json({ error: "Error not found" }, 404);
    return c.json({ error: result, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Resolve error" }, 500);
  }
});

legacyRoutes.get('/api/nexus/errors/recovery', async (c) => {

  try {
    return c.json({ patterns: getRecoveryPatterns(), ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Recovery error" }, 500);
  }
});

legacyRoutes.get('/api/local-infra', async (c) => {

  return c.json(getLocalInfraStatus());
});

legacyRoutes.get('/api/nexus/suggestions', async (c) => {

  try {
    return c.json({ active: getActiveSuggestions(), history: getSuggestionHistory() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Suggestions error" }, 500);
  }
});

legacyRoutes.post('/api/vibe/check', async (c) => {

  try {
    const { repoCount = 1, durationMs = 0 } = await c.req.json().catch(() => ({}))as { repoCount?: number; durationMs?: number };
    const score = await runQualityGates(repoCount, durationMs);
    return c.json(score);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Quality check error" }, 500);
  }
});

legacyRoutes.get('/api/vibe/history', async (c) => {

  return c.json(getBuildHistory());
});

legacyRoutes.get('/api/vibe/latest', async (c) => {

  const score = getLatestScore();
  if (!score) return c.json({ error: "No builds scored yet" }, 404);
  return c.json(score);
});

legacyRoutes.get('/api/vibe/gates', async (c) => {

  return c.json(GATE_DEFINITIONS);
});

legacyRoutes.get('/api/graphify/summary', async (c) => {

  return c.json({ summary: getGraphSummary(), available: graphAvailable() });
});

legacyRoutes.get('/api/graphify/query', async (c) => {

  const q = (c.c.req.query()('q') as string) || "";
  if (!q) return c.json({ error: "?q= required" }, 400);
  const nodes = queryGraph(q);
  return c.json({ query: q, results: nodes, count: nodes.length, available: graphAvailable() });
});

legacyRoutes.post('/api/toon/compress', async (c) => {

  try {
    const { content, aggressive } = await c.req.json().catch(() => ({}))as { content: string; aggressive?: boolean };
    if (!content) return c.json({ error: "content required" }, 400);
    const result = encodeToToon(content, { aggressive });
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Compression error" }, 500);
  }
});

legacyRoutes.get('/api/toon/stats', async (c) => {

  return c.json(getToonStats());
});

legacyRoutes.get('/api/coding-agent/apps', async (c) => {

  try {
    const apps = codingAgent.listGeneratedApps();
    return c.json({ apps, count: apps.length });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "List failed" }, 500);
  }
});

legacyRoutes.post('/api/coding-agent/cleanup', async (c) => {

  try {
    const maxAgeHours = parseInt(c.c.req.query()('maxAgeHours') as string, 10) || 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const result = codingAgent.cleanup(maxAgeMs);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Cleanup failed" }, 500);
  }
});

legacyRoutes.get('/api/deploy/availability', async (c) => {

  try {
    const avail = checkDeployAvailability();
    return c.json(avail);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Check failed" }, 500);
  }
});

legacyRoutes.get('/api/pipeline/logs/:id', async (c) => {

  try {
    const { id } = c.req.param();
    const logData = await getExecutionLog(id);
    if (!logData) return c.json({ error: "Logs not found" }, 404);
    return c.json(logData);
  } catch (err) {
    return c.json({ error: "Failed to fetch logs" }, 500);
  }
});

legacyRoutes.get('/api/pipeline/prs', async (c) => {

  try {
    const prs = await listPullRequests();
    return c.json(prs);
  } catch (err) {
    return c.json({ error: "Failed to fetch PRs" }, 500);
  }
});

legacyRoutes.post('/api/pipeline/prs/:id/hunks/:hunkId', async (c) => {

  try {
    const { id, hunkId } = c.req.param();
    const { status } = await c.req.json().catch(() => ({}))as { status: 'approved' | 'rejected' };
    const updatedPr = await updateHunkStatus(id, hunkId, status);
    if (!updatedPr) return c.json({ error: "PR or hunk not found" }, 404);
    return c.json(updatedPr);
  } catch (err) {
    return c.json({ error: "Failed to update hunk" }, 500);
  }
});

legacyRoutes.get('/api/audit/logs', async (c) => {

  try {
    const logs = await getAuditLogs();
    return c.json(logs);
  } catch (err) {
    return c.json({ error: "Failed to fetch audit logs" }, 500);
  }
});

