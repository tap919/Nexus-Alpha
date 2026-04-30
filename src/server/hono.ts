import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { stream } from 'hono/streaming';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { runAutomatedPipeline } from '../services/pipelineService';
import type { PipelineExecution } from '../types';
import {
  integrationHub,
  NanobotClient,
  QdrantClient,
  FirecrawlClient,
  TavilyClient,
  Mem0Client,
  LangfuseClient,
} from '../services/integrationService';
import { runDeterministicBrain, runBrowserHarness } from './brainToolService';
import { initPipelineQueue, enqueuePipeline, shutdownPipelineQueue } from './pipelineQueue';

const app = new Hono();

app.use('/*', cors({ origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'] }));

async function readJson<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  return await c.req.json().catch(() => ({})) as T;
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

app.post('/api/brain/browser', async (c) => {
  const body = await readJson<{ command?: string; timeout?: number }>(c);
  if (!body?.command) return c.json({ error: 'command is required' }, 400);
  try {
    const result = await runBrowserHarness({ command: body.command, timeout: body.timeout });
    return c.json({ result, ts: Date.now() });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ─── Gemini proxy ────────────────────────────────────────────────────────────
app.post('/api/proxy/gemini', async (c) => {
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
app.post('/api/proxy/cli/stream', async (c) => {
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

// ─── Globals for cleanup ────────────────────────────────────────────────────
let wsServer: WebSocketServer | null = null;
// ─── Start ───────────────────────────────────────────────────────────────────
(async () => {
  const queueReady = await initPipelineQueue();
  console.log(`[Q] BullMQ pipeline queue ${queueReady ? 'connected' : 'unavailable (simulated mode)'}`);

  const httpServer = createServer(async (req, res) => {
    const handler = app.fetch;
    const response = await handler(req as unknown as Request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });

  wsServer = new WebSocketServer({ server: httpServer });
  wsServer.on('connection', (ws) => {
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

  httpServer.listen(PORT_HTTP, () => {
    console.log(`[Hono] Nexus Alpha server running on port ${PORT_HTTP}`);
    console.log(`[WS]   WebSocket on same port`);
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
