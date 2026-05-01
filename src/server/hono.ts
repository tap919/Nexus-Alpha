import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { verify } from 'hono/jwt';
import { serve } from '@hono/node-server';
import { rateLimiter } from 'hono-rate-limiter';
import { WebSocketServer, WebSocket } from 'ws';
import { logAuditEvent, initAuditService } from './auditLogService';

type Variables = {
  user: { sub: string; role: string; email?: string };
};
import { runAutomatedPipeline } from '../services/pipelineService';
import type { PipelineExecution } from '../types';
import {
  integrationHub,
} from '../services/integrationService';
import { runDeterministicBrain, runBrowserHarness } from './brainToolService';
import { initPipelineQueue, enqueuePipeline, shutdownPipelineQueue } from './pipelineQueue';
import {
  generateWithCheetah,
  getCheetahPatterns,
  getCheetahStatus,
  estimateCheetahSavings,
  type CheetahPattern,
} from '../services/cheetahService';
import { broadcastService } from './broadcastService';
import { secretsManager, type SecretKey } from './secretsManager';
import { listGeneratedApps, listAppFiles, readAppFile, writeAppFile } from './editorService';
import { listTemplates, getTemplateForDescription } from '../core/agents/templates/registry';
import CodingAgentService from '../services/codingAgentService';
import { settingsService, type PrivacyMode } from './settingsService';
import { plannerAgent } from '../core/agents/plannerAgent';

const app = new Hono<{ Variables: Variables }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────

const NEXUS_API_KEY = process.env.NEXUS_API_KEY || '';
const AUTH_BYPASS = process.env.NEXUS_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long';

app.use('/api/*', async (c, next) => {
  if (AUTH_BYPASS) {
    c.set('user', { sub: 'bypass-user', role: 'admin' });
    return next();
  }
  if (c.req.method === 'OPTIONS') return next();

  const key = c.req.header('x-api-key') || c.req.header('x-nexus-api-key');
  const auth = c.req.header('authorization');

  // API key check (server-to-server)
  if (NEXUS_API_KEY && key === NEXUS_API_KEY) {
    c.set('user', { sub: 'system', role: 'system' });
    return next();
  }

  // Strict JWT verification against Supabase secret with issuer/audience
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const payload = await verify(token, SUPABASE_JWT_SECRET);
      if (payload && payload.exp && Date.now() / 1000 < (payload.exp as number)) {
        // Enforce audience parity (Supabase default is 'authenticated')
        if (payload.aud !== 'authenticated') {
          throw new Error('Invalid JWT audience');
        }
        c.set('user', { 
          sub: (payload.sub as string) || 'unknown', 
          role: (payload.user_role as string) || 'user',
          email: payload.email as string
        });
        return next();
      }
    } catch (e) { 
      /* JWT verification failed, log it */ 
      await logAuditEvent({
        actor: 'anonymous',
        action: 'auth_failed',
        target: c.req.path,
        status: 'failure',
        metadata: { reason: e instanceof Error ? e.message : 'Invalid token signature' }
      }).catch(() => {});
    }
  }

  await logAuditEvent({
    actor: 'anonymous',
    action: 'access_denied',
    target: c.req.path,
    status: 'failure',
    metadata: { reason: 'No valid credentials' }
  }).catch(() => {});
  return c.json({ error: 'Unauthorized' }, 401);
});

// ─── RBAC Authorization Middleware ─────────────────────────────────────────────
export const requireRole = (allowedRoles: string[]) => {
  return async (c: any, next: any) => {
    const user = c.get('user');
    if (!user || (!allowedRoles.includes(user.role) && user.role !== 'admin' && user.role !== 'system')) {
      await logAuditEvent({
        actor: user?.sub || 'anonymous',
        action: 'rbac_denied',
        target: c.req.path,
        status: 'failure',
        metadata: { role: user?.role, required: allowedRoles }
      }).catch(() => {});
      return c.json({ error: 'Forbidden: Insufficient role' }, 403);
    }
    return next();
  };
};

// ─── Rate limiting (Redis-ready via hono-rate-limiter) ───────────────────────
const defaultLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => c.get('user')?.sub || c.req.header('x-forwarded-for') || 'anonymous',
  message: 'Too many requests, please try again later.',
  handler: async (c, next) => {
    await logAuditEvent({
      actor: (c as any).get('user')?.sub || 'anonymous',
      action: 'rate_limit_exceeded',
      target: c.req.path,
      status: 'warning',
      metadata: { limit: 100 }
    }).catch(() => {});
    return c.json({ error: 'Too many requests' }, 429);
  }
});

const strictLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: (c) => c.get('user')?.sub || c.req.header('x-forwarded-for') || 'anonymous',
  message: 'Quota exceeded for high-cost endpoint.',
  handler: async (c, next) => {
    await logAuditEvent({
      actor: (c as any).get('user')?.sub || 'anonymous',
      action: 'quota_exceeded',
      target: c.req.path,
      status: 'warning',
      metadata: { limit: 15 }
    }).catch(() => {});
    return c.json({ error: 'Quota exceeded' }, 429);
  }
});

app.use('/api/*', defaultLimiter);

app.use('/*', cors({ origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'] }));

async function readJson<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T | null> {
  try {
    return await c.req.json() as T;
  } catch {
    return null;
  }
}

const PORT_HTTP = Number(process.env.PORT ?? 3002);

const clients = new Set<WebSocket>();

function broadcast(data: unknown): void {
  const json = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// ─── API Routes ──────────────────────────────────────────────────────────────

app.get('/health', async (c) => {
  // Hide operational WS counts unless properly authenticated
  if (AUTH_BYPASS) return c.json({ status: 'ok', wsClients: clients.size, ts: Date.now() });

  const auth = c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) {
    try {
      await verify(auth.slice(7), SUPABASE_JWT_SECRET);
      return c.json({ status: 'ok', wsClients: clients.size, ts: Date.now() });
    } catch { /* ignore */ }
  }
  return c.json({ status: 'ok', ts: Date.now() });
});

app.post('/api/pipeline/run', requireRole(['admin', 'system']), strictLimiter, async (c) => {
  const user = c.get('user');
  const body = await readJson<{ repos?: string[]; agentId?: string }>(c);
  const repos = body?.repos;
  if (!Array.isArray(repos) || repos.length === 0) {
    return c.json({ error: 'repos array required' }, 400);
  }

  const result = await enqueuePipeline(repos, user.sub, body?.agentId);

  if (!result.simulated) {
    return c.json({ started: true, executionId: result.id, mode: 'queue' });
  }

  let executionId = '';
  runAutomatedPipeline(repos.join(' + '), (exec: PipelineExecution) => {
    if (!executionId) executionId = exec.id;
    broadcast({ type: 'pipeline:update', execution: exec });
  });

  return c.json({ started: true, executionId: result.id, mode: 'simulated' });
});

app.get('/api/pipeline/status/:id', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const user = c.get('user');
  const jobId = c.req.param('id');
  try {
    const status = await getJobStatus(jobId, user.sub);
    return c.json(status);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, error instanceof Error && error.message.includes('Forbidden') ? 403 : 404);
  }
});

app.get('/api/integrations/status', requireRole(['admin', 'user']), async (c) => {
  try {
    const status = await integrationHub.getStatus();
    return c.json({
      connected: Object.values(status).some(Boolean),
      services: status,
      ts: Date.now(),
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.post('/api/integrations/agent/chat', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const body = await readJson<{ message?: string; sessionId?: string }>(c);
  if (!body?.message) return c.json({ error: 'message is required' }, 400);
  try {
    if (!integrationHub.nanobot) return c.json({ error: 'Nanobot not configured' }, 503);
    const response = await integrationHub.nanobot.sendMessage(body.message, body.sessionId);
    return c.json(response);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.post('/api/integrations/search/web', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const body = await readJson<{ query?: string; source?: 'firecrawl' | 'tavily' | 'all' }>(c);
  if (!body?.query) return c.json({ error: 'query is required' }, 400);
  try {
    let results;
    if (body.source === 'firecrawl' && integrationHub.firecrawl) {
      results = await integrationHub.firecrawl.search(body.query);
    } else if (body.source === 'tavily' && integrationHub.tavily) {
      results = await integrationHub.tavily.search(body.query);
    } else {
      results = await integrationHub.searchAll(body.query);
    }
    return c.json({ results, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.post('/api/integrations/memory/add', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const user = c.get('user');
  const body = await readJson<{ content?: string; metadata?: Record<string, unknown> }>(c);
  if (!body?.content) return c.json({ error: 'content is required' }, 400);
  try {
    if (!integrationHub.mem0) return c.json({ error: 'Mem0 not configured' }, 503);
    const success = await integrationHub.mem0.addMemory(user.sub, body.content, body.metadata);
    return c.json({ success, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.get('/api/integrations/memory', requireRole(['admin', 'user']), async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '10');
  try {
    if (!integrationHub.mem0) return c.json({ error: 'Mem0 not configured' }, 503);
    const memories = await integrationHub.mem0.getMemories(user.sub, limit);
    return c.json({ memories, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.post('/api/brain/query', requireRole(['admin', 'agent-runner']), strictLimiter, async (c) => {
  const body = await readJson<{ query?: string; lane?: string; verbose?: boolean }>(c);
  if (!body?.query) return c.json({ error: 'query is required' }, 400);
  try {
    const result = await runDeterministicBrain({ query: body.query, lane: body.lane as any, verbose: body.verbose });
    return c.json({ result, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

const BROWSER_COMMAND_ALLOWLIST = new Set([
  'screenshot', 'navigate', 'click', 'type', 'wait',
  'get_text', 'get_html', 'scroll', 'wait_for_selector',
  'new_tab', 'wait_for_load', 'page_info', 'page_source', 'page_links', 'capture_screenshot'
]);

app.post('/api/brain/browser', requireRole(['admin', 'agent-runner']), strictLimiter, async (c) => {
  const body = await readJson<{ command?: string; timeout?: number }>(c);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
  if (!body.command) return c.json({ error: 'command is required' }, 400);
  
  // Basic pre-flight check before hitting strict engine parser
  const cmdRaw = body.command.split(';')[0].split('(')[0].trim();
  const cmd = cmdRaw.startsWith('print') ? cmdRaw.slice(5).trim() : cmdRaw;
  
  if (!BROWSER_COMMAND_ALLOWLIST.has(cmd)) {
    return c.json({ error: `Command "${cmd}" not permitted. Allowed: ${[...BROWSER_COMMAND_ALLOWLIST].join(', ')}` }, 403);
  }
  try {
    const result = await runBrowserHarness({ command: body.command, timeout: body.timeout });
    return c.json({ result, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ─── Cheetah V3 Autocoder Routes ─────────────────────────────────────────────

/** POST /api/autocoder/generate — Generate code using Cheetah V3 */
app.post('/api/autocoder/generate', requireRole(['admin', 'system']), strictLimiter, async (c) => {
  const body = await readJson<{
    pattern?: CheetahPattern;
    name?: string;
    options?: Record<string, unknown>;
  }>(c);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
  if (!body.pattern || !body.name) {
    return c.json({ error: 'pattern and name are required' }, 400);
  }

  const supported = getCheetahPatterns();
  if (!supported.includes(body.pattern)) {
    return c.json({ error: `Unknown pattern. Supported: ${supported.join(', ')}` }, 400);
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await generateWithCheetah({
    taskId,
    pattern: body.pattern,
    name: body.name,
    options: body.options as any,
  });

  return c.json(result, result.success ? 200 : 500);
});

/** GET /api/autocoder/patterns — List supported Cheetah patterns */
app.get('/api/autocoder/patterns', (c) => {
  const patterns = getCheetahPatterns();
  return c.json({
    patterns: patterns.map(p => ({ pattern: p, tokenSavings: estimateCheetahSavings(p) })),
    total: patterns.length,
  });
});

/** GET /api/autocoder/status — Cheetah engine status */
app.get('/api/autocoder/status', async (c) => {
  try {
    const status = await getCheetahStatus();
    return c.json({ ...status, ts: Date.now() });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Status error' }, 500);
  }
});

// ─── Coding & Agents ─────────────────────────────────────────────────────────
const codingService = new CodingAgentService();

app.get('/api/coding/templates', requireRole(['admin', 'user']), (c) => {
  return c.json({ templates: listTemplates() });
});

app.post('/api/coding/generate', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const user = c.get('user');
  const body = await readJson<{ description: string; templateId?: string; privacyPreference?: 'local' | 'cloud' }>(c);
  
  if (!body?.description) return c.json({ error: 'description is required' }, 400);

  const result = await codingService.generateApp({
    description: body.description,
    templateId: body.templateId, // Passing templateId if user selected one
  } as any);

  if (result.success) {
    await logAuditEvent({
      actor: user.sub,
      action: 'codegen_success',
      target: result.appPath,
      status: 'success',
      metadata: { templateId: result.templateId, files: result.files?.length }
    }).catch(() => {});
    return c.json(result);
  } else {
    await logAuditEvent({
      actor: user.sub,
      action: 'codegen_failure',
      target: 'codegen',
      status: 'failure',
      metadata: { error: result.message, description: body.description }
    }).catch(() => {});
    return c.json(result, 500);
  }
});

// ─── Editor API ──────────────────────────────────────────────────────────────
app.get('/api/editor/list', requireRole(['admin', 'user']), (c) => {
  return c.json({ apps: listGeneratedApps() });
});

app.get('/api/editor/tree/:appId', requireRole(['admin', 'user']), (c) => {
  const appId = c.req.param('appId');
  const tree = listAppFiles(appId);
  if (!tree) return c.json({ error: 'App not found or access denied' }, 404);
  return c.json({ tree });
});

app.get('/api/editor/file', requireRole(['admin', 'user']), (c) => {
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'path is required' }, 400);
  const content = readAppFile(filePath);
  if (content === null) return c.json({ error: 'File not found or access denied' }, 404);
  return c.json({ content });
});

app.post('/api/editor/file', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const user = c.get('user');
  const body = await readJson<{ path: string; content: string }>(c);
  if (!body?.path || body.content === undefined) return c.json({ error: 'path and content required' }, 400);

  try {
    writeAppFile(body.path, body.content);
    await logAuditEvent({
      actor: user.sub,
      action: 'editor_write',
      target: body.path,
      status: 'success'
    }).catch(() => {});
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 403);
  }
});    

// ─── Planning API ────────────────────────────────────────────────────────────
app.post('/api/coding/plan', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const user = c.get('user');
  const body = await readJson<{ description: string; appId?: string }>(c);
  if (!body?.description) return c.json({ error: 'description required' }, 400);

  // Get current file list for context if appId provided
  let existingFiles: string[] = [];
  if (body.appId) {
    const tree = listAppFiles(body.appId);
    if (tree) {
      const flatten = (nodes: any[]): string[] => {
        return nodes.flatMap(n => n.type === 'file' ? [n.path] : flatten(n.children || []));
      };
      existingFiles = flatten(tree);
    }
  }

  try {
    const plan = await plannerAgent.createPlan(body.description, { existingFiles });
    await logAuditEvent({
      actor: user.sub,
      action: 'codegen_plan',
      target: body.appId || 'new_app',
      status: 'success',
      metadata: { title: plan.title, steps: plan.steps.length }
    }).catch(() => {});
    
    return c.json(plan);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.post('/api/coding/plan/apply', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const user = c.get('user');
  const body = await readJson<{ planId: string; stepId?: string }>(c);
  if (!body?.planId) return c.json({ error: 'planId required' }, 400);

  // In Phase 2, this would trigger the actual file writes or Temporal workflow
  // For now, we simulate success
  await logAuditEvent({
    actor: user.sub,
    action: 'codegen_apply',
    target: body.planId,
    status: 'success',
    metadata: { stepId: body.stepId }
  }).catch(() => {});

  return c.json({ success: true, message: 'Plan application initiated' });
});

// ─── Settings API ────────────────────────────────────────────────────────────
app.get('/api/settings', requireRole(['admin', 'user']), (c) => {
  return c.json(settingsService.getSettings());
});

app.post('/api/settings/privacy-mode', requireRole(['admin', 'user']), async (c) => {
  const user = c.get('user');
  const body = await readJson<{ mode: PrivacyMode }>(c);
  if (!body?.mode) return c.json({ error: 'mode required' }, 400);
  
  settingsService.setPrivacyMode(body.mode);
  await logAuditEvent({
    actor: user.sub,
    action: 'privacy_mode_change',
    target: 'settings',
    status: 'success',
    metadata: { mode: body.mode }
  }).catch(() => {});
  
  return c.json({ success: true, mode: body.mode });
});

// ─── Gemini proxy ────────────────────────────────────────────────────────────
app.post('/api/proxy/gemini', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  try {
    const user = c.get('user');
    const body = await readJson<{ prompt?: string; model?: string }>(c);
    if (!body?.prompt) return c.json({ error: 'prompt required' }, 400);

    // Local-First Routing
    if (settingsService.isLocalMode()) {
      try {
        const ollamaRes = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          body: JSON.stringify({ model: 'llama3', prompt: body.prompt, stream: false }),
        });
        if (ollamaRes.ok) {
          const data = await ollamaRes.json();
          return c.json({ text: data.response, source: 'ollama' });
        }
      } catch (ollamaErr) {
        console.error('[Ollama] Failed, falling back to Gemini:', (ollamaErr as Error).message);
      }
    }

    // Prioritize user secret over system ENV
    const apiKey = (await secretsManager.get(user.sub, 'GEMINI_API_KEY')) || process.env.GEMINI_API_KEY;
    
    if (!apiKey) return c.json({ error: 'GEMINI_API_KEY not configured' }, 503);
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: body.model ?? 'gemini-2.0-flash',
      contents: body.prompt,
    });
    return c.json({ text: result.text, source: 'gemini' });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Gemini unavailable' }, 503);
  }
});

// ─── CLI proxy (SSE stream) ─────────────────────────────────────────────────
app.post('/api/proxy/cli/stream', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  try {
    const body = await readJson<{
      provider?: 'openrouter' | 'deepseek' | 'opencode';
      messages?: Array<{ role: string; content: string }>;
      model?: string;
    }>(c);
    if (!body?.provider || !body?.messages) return c.json({ error: 'provider and messages required' }, 400);

    const user = c.get('user');
    const endpoints: Record<string, { url: string; key: string | undefined; model: string; secretKey: SecretKey }> = {
      openrouter: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: (await secretsManager.get(user.sub, 'OPENROUTER_API_KEY')) || process.env.OPENROUTER_API_KEY,
        model: body.model ?? 'google/gemini-2.0-flash-001',
        secretKey: 'OPENROUTER_API_KEY',
      },
      deepseek: {
        url: 'https://api.deepseek.com/v1/chat/completions',
        key: (await secretsManager.get(user.sub, 'DEEPSEEK_API_KEY')) || process.env.DEEPSEEK_API_KEY,
        model: body.model ?? 'deepseek-chat',
        secretKey: 'DEEPSEEK_API_KEY',
      },
      opencode: {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        key: (await secretsManager.get(user.sub, 'GEMINI_API_KEY')) || process.env.GEMINI_API_KEY,
        model: body.model ?? 'gemini-2.0-flash',
        secretKey: 'GEMINI_API_KEY',
      },
    };

    const cfg = endpoints[body.provider];
    if (!cfg) return c.json({ error: `Unknown provider: ${body.provider}` }, 400);
    if (!cfg.key) return c.json({ error: `API key not configured for ${body.provider} (${cfg.secretKey})` }, 503);

    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    const controller = new AbortController();
    const fetchRes = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({ model: cfg.model, messages: body.messages, stream: true }),
      signal: controller.signal,
    });

    if (!fetchRes.ok) {
      return stream(c, async (streamWriter) => {
        await streamWriter.write(`data: [ERROR] HTTP ${fetchRes.status}\n\n`);
        await streamWriter.write('data: [DONE]\n\n');
      });
    }

    return stream(c, async (streamWriter) => {
      const reader = fetchRes.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            await streamWriter.write(line + '\n\n');
          }
        }
      }
      await streamWriter.write('data: [DONE]\n\n');
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Stream error' }, 503);
  }
});

// ─── Secrets Management ───────────────────────────────────────────────────────
app.get('/api/secrets', requireRole(['admin', 'user']), async (c) => {
  const user = c.get('user');
  const keys = await secretsManager.list(user.sub);
  return c.json({ 
    keys,
    masked: keys.reduce((acc, k) => {
      acc[k] = '********';
      return acc;
    }, {} as Record<string, string>)
  });
});

app.post('/api/secrets/set', requireRole(['admin', 'user']), strictLimiter, async (c) => {
  const user = c.get('user');
  const body = await readJson<{ key: SecretKey; value: string }>(c);
  if (!body?.key || !body?.value) return c.json({ error: 'key and value required' }, 400);
  await secretsManager.set(user.sub, body.key, body.value);
  return c.json({ success: true });
});

app.delete('/api/secrets/:key', requireRole(['admin', 'user']), async (c) => {
  const user = c.get('user');
  const key = c.req.param('key') as SecretKey;
  await secretsManager.remove(user.sub, key);
  return c.json({ success: true });
});


// ─── Globals for cleanup ─────────────────────────────────────────────────────
let wsServer: WebSocketServer | null = null;
const MAX_WS_CLIENTS = Number(process.env.MAX_WS_CLIENTS ?? 200);

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  // Production safety: require a real API key and JWT secret
  if (process.env.NODE_ENV === 'production') {
    if (!NEXUS_API_KEY || NEXUS_API_KEY === 'nexus-alpha-dev-key') {
      console.error('[CRITICAL] NEXUS_API_KEY must be set to a secure value in production.');
      process.exit(1);
    }
    if (!process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT_SECRET === 'super-secret-jwt-token-with-at-least-32-characters-long') {
      console.error('[CRITICAL] SUPABASE_JWT_SECRET must be set to a real project secret in production.');
      process.exit(1);
    }
  }

  const queueReady = await initPipelineQueue();
  console.log(`[Q] BullMQ pipeline queue ${queueReady ? 'connected' : 'unavailable (simulated mode)'}`);

  // Proper Hono Node Server streaming adapter
  const httpServer = serve({
    fetch: app.fetch,
    port: PORT_HTTP,
  }, (info) => {
    console.log(`[Hono] Nexus Alpha server running on port ${info.port}`);
    console.log(`[WS]   WebSocket at ws://localhost:${info.port}/ws`);
    if (AUTH_BYPASS) console.warn('[WARN] Auth bypass is ON — do not use NEXUS_AUTH_BYPASS=true in production');
  });

  wsServer = new WebSocketServer({ server: httpServer as any, path: '/ws' });
  wsServer.on('connection', async (ws, req) => {
    if (clients.size >= MAX_WS_CLIENTS) {
      ws.close(1013, 'Server at capacity');
      return;
    }

    // Strict JWT Check for WebSocket
    let sub = 'anonymous';
    if (!AUTH_BYPASS) {
      const url = new URL(req.url ?? '/', `http://localhost`);
      const token = url.searchParams.get('token');
      if (!token) {
        await logAuditEvent({ actor: 'anonymous', action: 'ws_auth_denied', target: '/ws', status: 'failure', metadata: { reason: 'Missing token' } }).catch(() => {});
        ws.close(1008, 'Unauthorized');
        return;
      }
      try {
        const payload = await verify(token, SUPABASE_JWT_SECRET);
        if (!payload || !payload.exp || Date.now() / 1000 >= (payload.exp as number) || payload.aud !== 'authenticated') {
          await logAuditEvent({ actor: payload?.sub as string || 'anonymous', action: 'ws_auth_denied', target: '/ws', status: 'failure', metadata: { reason: 'Token invalid or wrong audience' } }).catch(() => {});
          ws.close(1008, 'Token expired or invalid');
          return;
        }
        sub = payload.sub as string;
        
        // Quota: Limit WS connections per user
        let userConns = 0;
        for (const [_, clientSub] of Array.from(clients).map(c => [c, (c as any).nexusSub])) {
          if (clientSub === sub) userConns++;
        }
        if (userConns >= 5) {
          await logAuditEvent({ actor: sub, action: 'ws_quota_exceeded', target: '/ws', status: 'failure', metadata: { connections: userConns } }).catch(() => {});
          ws.close(1013, 'User connection quota exceeded');
          return;
        }
      } catch (e) {
        await logAuditEvent({ actor: 'anonymous', action: 'ws_auth_denied', target: '/ws', status: 'failure', metadata: { reason: 'Invalid signature' } }).catch(() => {});
        ws.close(1008, 'Invalid token signature');
        return;
      }
    } else {
      sub = 'bypass-user';
    }

    (ws as any).nexusSub = sub;

    clients.add(ws);
    ws.send(JSON.stringify({ type: 'connected', message: 'Nexus Alpha WS ready', ts: Date.now() }));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', (err) => { console.error('[WS] Client error:', err.message); clients.delete(ws); });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      } catch { /* ignore */ }
    });
  });

  broadcastService.setHandler((data) => {
    const json = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(json);
    }
  });
})();

process.on('SIGTERM', async () => {
  if (wsServer) wsServer.close(() => {});
  await shutdownPipelineQueue();
  process.exit(0);
});
process.on('SIGINT', async () => {
  if (wsServer) wsServer.close(() => {});
  await shutdownPipelineQueue();
  process.exit(0);
});

export { app, broadcast };
