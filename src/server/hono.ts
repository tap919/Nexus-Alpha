import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
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
import { legacyRoutes } from './legacyRoutes';

const app = new Hono();

// ─── Auth Middleware ──────────────────────────────────────────────────────────

const NEXUS_API_KEY = process.env.NEXUS_API_KEY || '';
const AUTH_BYPASS = process.env.NEXUS_AUTH_BYPASS === 'true';

app.use('/api/*', async (c, next) => {
  if (AUTH_BYPASS) return next();
  if (c.req.method === 'OPTIONS') return next();

  const key =
    c.req.header('x-api-key') ||
    c.req.header('x-nexus-api-key');
  const auth = c.req.header('authorization');

  // API key check (server-to-server)
  if (NEXUS_API_KEY && key === NEXUS_API_KEY) return next();

  // JWT bearer check (frontend Supabase sessions)
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const [, payloadB64] = token.split('.')
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp && Date.now() / 1000 < payload.exp) return next();
      }
    } catch { /* fall through to 401 */ }
  }

  return c.json({ error: 'Unauthorized' }, 401);
});

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxPerMin: number) {
  return async (c: any, next: any) => {
    const ip = c.req.header('x-forwarded-for') ?? c.env?.ip ?? 'unknown';
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    } else {
      bucket.count++;
      if (bucket.count > maxPerMin) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
      }
    }
    return next();
  };
}

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

app.get('/health', (c) => c.json({ status: 'ok', wsClients: clients.size, ts: Date.now() }));

app.post('/api/pipeline/run', async (c) => {
  const body = await readJson<{ repos?: string[]; agentId?: string }>(c);
  const repos = body?.repos;
  if (!Array.isArray(repos) || repos.length === 0) {
    return c.json({ error: 'repos array required' }, 400);
  }

  const result = await enqueuePipeline(repos, body?.agentId);

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

app.get('/api/pipeline/status', (c) => c.json({ wsClients: clients.size, ts: Date.now() }));

app.get('/api/integrations/status', async (c) => {
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

app.post('/api/integrations/agent/chat', async (c) => {
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

app.post('/api/integrations/search/web', async (c) => {
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

app.post('/api/integrations/memory/add', async (c) => {
  const body = await readJson<{ userId?: string; content?: string; metadata?: Record<string, unknown> }>(c);
  if (!body?.userId || !body?.content) return c.json({ error: 'userId and content are required' }, 400);
  try {
    if (!integrationHub.mem0) return c.json({ error: 'Mem0 not configured' }, 503);
    const success = await integrationHub.mem0.addMemory(body.userId, body.content, body.metadata);
    return c.json({ success, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.get('/api/integrations/memory/:userId', async (c) => {
  const userId = c.req.param('userId');
  const limit = parseInt(c.req.query('limit') || '10');
  if (!userId) return c.json({ error: 'userId is required' }, 400);
  try {
    if (!integrationHub.mem0) return c.json({ error: 'Mem0 not configured' }, 503);
    const memories = await integrationHub.mem0.getMemories(userId, limit);
    return c.json({ memories, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

app.post('/api/brain/query', async (c) => {
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
  'get_text', 'get_html', 'evaluate', 'scroll', 'wait_for_selector',
]);

app.post('/api/brain/browser', async (c) => {
  const body = await readJson<{ command?: string; timeout?: number }>(c);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
  if (!body.command) return c.json({ error: 'command is required' }, 400);
  const cmd = body.command.split(' ')[0];
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
app.post('/api/autocoder/generate', rateLimit(30), async (c) => {
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

// ─── Gemini proxy ────────────────────────────────────────────────────────────
app.post('/api/proxy/gemini', rateLimit(20), async (c) => {
  try {
    const body = await readJson<{ prompt?: string; model?: string }>(c);
    if (!body?.prompt) return c.json({ error: 'prompt required' }, 400);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return c.json({ error: 'GEMINI_API_KEY not configured' }, 503);
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: body.model ?? 'gemini-2.0-flash',
      contents: body.prompt,
    });
    return c.json({ text: result.text });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Gemini unavailable' }, 503);
  }
});

// ─── CLI proxy (SSE stream) ─────────────────────────────────────────────────
app.post('/api/proxy/cli/stream', rateLimit(20), async (c) => {
  try {
    const body = await readJson<{
      provider?: 'openrouter' | 'deepseek' | 'opencode';
      messages?: Array<{ role: string; content: string }>;
      model?: string;
    }>(c);
    if (!body?.provider || !body?.messages) return c.json({ error: 'provider and messages required' }, 400);

    const endpoints: Record<string, { url: string; key: string; model: string }> = {
      openrouter: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: process.env.OPENROUTER_API_KEY ?? '',
        model: body.model ?? 'google/gemini-2.0-flash-001',
      },
      deepseek: {
        url: 'https://api.deepseek.com/v1/chat/completions',
        key: process.env.DEEPSEEK_API_KEY ?? '',
        model: body.model ?? 'deepseek-chat',
      },
    };

    const cfg = endpoints[body.provider];
    if (!cfg) return c.json({ error: `Unknown provider: ${body.provider}` }, 400);
    if (!cfg.key) return c.json({ error: `API key not configured for ${body.provider}` }, 503);

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

// ─── Mount Legacy Routes ─────────────────────────────────────────────────────
app.route('/', legacyRoutes);

// ─── Globals for cleanup ─────────────────────────────────────────────────────
let wsServer: WebSocketServer | null = null;
const MAX_WS_CLIENTS = Number(process.env.MAX_WS_CLIENTS ?? 200);

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  // Production safety: require a real API key
  if (process.env.NODE_ENV === 'production' && (!NEXUS_API_KEY || NEXUS_API_KEY === 'nexus-alpha-dev-key')) {
    console.error('[CRITICAL] NEXUS_API_KEY must be set to a secure value in production.');
    process.exit(1);
  }

  const queueReady = await initPipelineQueue();
  console.log(`[Q] BullMQ pipeline queue ${queueReady ? 'connected' : 'unavailable (simulated mode)'}`);

  const httpServer = createServer(async (req, res) => {
    const handler = app.fetch;
    const response = await handler(req as unknown as Request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });

  wsServer = new WebSocketServer({ server: httpServer, path: '/ws' });
  wsServer.on('connection', (ws, req) => {
    if (clients.size >= MAX_WS_CLIENTS) {
      ws.close(1013, 'Server at capacity');
      return;
    }

    // Auth check for WebSocket (skip in dev bypass mode)
    if (!AUTH_BYPASS) {
      const url = new URL(req.url ?? '/', `http://localhost`);
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(1008, 'Unauthorized');
        return;
      }
    }

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

  httpServer.listen(PORT_HTTP, () => {
    console.log(`[Hono] Nexus Alpha server running on port ${PORT_HTTP}`);
    console.log(`[WS]   WebSocket at ws://localhost:${PORT_HTTP}/ws`);
    if (AUTH_BYPASS) console.warn('[WARN] Auth bypass is ON — do not use NEXUS_AUTH_BYPASS=true in production');
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
