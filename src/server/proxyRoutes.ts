import { Router } from 'express';
import path from 'path';

export const proxyRouter = Router();

// This will be passed from index.ts
let SERVER_API_KEYS: any = {};

export function setProxyKeys(keys: any) {
  SERVER_API_KEYS = keys;
}

function requireKey(key: string): string {
  if (!key) throw new Error('API key not configured on server');
  return key;
}

// ─── Request Cache ────────────────────────────────────────────────────────────
interface CacheEntry {
  text: string;
  expiresAt: number;
}
const PROXY_CACHE = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 1000;
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

function getCachedResponse(prompt: string, model: string): string | null {
  const key = `${model}:${prompt}`;
  const entry = PROXY_CACHE.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.text;
  }
  if (entry) PROXY_CACHE.delete(key);
  return null;
}

function setCachedResponse(prompt: string, model: string, text: string): void {
  if (PROXY_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = PROXY_CACHE.keys().next().value;
    if (firstKey !== undefined) PROXY_CACHE.delete(firstKey);
  }
  PROXY_CACHE.set(`${model}:${prompt}`, {
    text,
    expiresAt: Date.now() + DEFAULT_TTL,
  });
}

// ─── Gemini proxy ────────────────────────────────────────────────────────────
proxyRouter.post('/gemini', async (req, res) => {
  try {
    const key = requireKey(SERVER_API_KEYS.gemini);
    const { prompt, model } = req.body as { prompt: string; model?: string };
    const selectedModel = model ?? 'gemini-2.0-flash';

    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    // --- Check Cache ---
    const cached = getCachedResponse(prompt, selectedModel);
    if (cached) {
      return res.json({ text: cached });
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const result = await ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
    });

    const text = result.text;
    
    // --- Set Cache ---
    setCachedResponse(prompt, selectedModel, text);

    res.json({ text });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'Gemini unavailable' });
  }
});

// ─── GitHub proxy ────────────────────────────────────────────────────────────
proxyRouter.get('/github/*', async (req, res) => {
  try {
    const token = SERVER_API_KEYS.github || undefined;
    const ghPath = req.params[0] as string;

    // Restrict to read-only endpoints
    if (!ghPath.startsWith('repos/') && !ghPath.startsWith('search/') && !ghPath.startsWith('users/')) {
      return res.status(403).json({ error: 'Proxied path not allowed' });
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const ghRes = await fetch(`https://api.github.com/${ghPath}`, { headers, signal: controller.signal });
      if (!ghRes.ok) return res.status(ghRes.status).json({ error: ghRes.statusText });
      res.json(await ghRes.json());
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'GitHub unavailable' });
  }
});

// ─── CLI proxy (OpenRouter / DeepSeek streaming) ─────────────────────────────
proxyRouter.post('/cli/stream', async (req, res) => {
  try {
    const { provider, messages, model } = req.body as {
      provider: 'openrouter' | 'deepseek' | 'opencode';
      messages: Array<{ role: string; content: string }>;
      model?: string;
    };

    if (!provider || !messages) return res.status(400).json({ error: 'provider and messages required' });

    const endpoints: Record<string, { url: string; key: string; model: string }> = {
      openrouter: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: requireKey(SERVER_API_KEYS.openrouter),
        model: model ?? 'google/gemini-2.0-flash-001',
      },
      deepseek: {
        url: 'https://api.deepseek.com/v1/chat/completions',
        key: requireKey(SERVER_API_KEYS.deepseek),
        model: model ?? 'deepseek-chat',
      },
      opencode: {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${requireKey(SERVER_API_KEYS.gemini)}`,
        key: '',
        model: 'gemini-2.0-flash',
      },
    };

    const cfg = endpoints[provider];
    if (!cfg) return res.status(400).json({ error: `Unknown provider: ${provider}` });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const body = provider === 'opencode'
      ? JSON.stringify({ contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) })
      : JSON.stringify({ model: cfg.model, messages, stream: true });

    const fetchRes = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.key ? { 'Authorization': `Bearer ${cfg.key}` } : {}),
      },
      body,
      signal: controller.signal,
    });

    if (!fetchRes.ok) {
      res.write(`data: [ERROR] HTTP ${fetchRes.status}: ${fetchRes.statusText}\n\n`);
      res.end();
      return;
    }

    const reader = fetchRes.body?.getReader();
    if (!reader) { res.end(); return; }

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
          res.write(`${line}\n\n`);
        }
      }
    }

    if (buffer) res.write(`${buffer}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(503).json({ error: e instanceof Error ? e.message : 'Stream unavailable' });
    } else {
      res.end();
    }
  }
});
