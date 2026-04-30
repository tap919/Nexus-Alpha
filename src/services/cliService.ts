/**
 * Multi-provider CLI Service
 * Wires OpenRouter, DeepSeek, and OpenCode to real API endpoints.
 */

import { secretsService } from "./secretsService";

export type CLIProvider = "opencode" | "openrouter" | "deepseek";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface StreamCallback {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
}

// ─── OpenRouter ──────────────────────────────────────────────────────────────
async function streamOpenRouter(
  messages: ChatMessage[],
  model = "openai/gpt-4o-mini",
  callbacks: StreamCallback
): Promise<void> {
  const apiKey = secretsService.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured. Add it in Settings > Secrets.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Nexus Alpha",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${res.statusText}`);
  await readSSEStream(res, callbacks);
}

// ─── DeepSeek ──────────────────────────────────────────────────────────────
async function streamDeepSeek(
  messages: ChatMessage[],
  model = "deepseek-chat",
  callbacks: StreamCallback
): Promise<void> {
  const apiKey = secretsService.get("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured. Add it in Settings > Secrets.");

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) throw new Error(`DeepSeek error: ${res.status} ${res.statusText}`);
  await readSSEStream(res, callbacks);
}

// ─── OpenCode (Gemini via ai.google.dev) ───────────────────────────────
async function streamOpenCode(
  messages: ChatMessage[],
  model = "gemini-2.5-flash",
  callbacks: StreamCallback
): Promise<void> {
  // OpenCode proxies to Gemini — we use the same API key
  const apiKey = secretsService.get("GEMINI_API_KEY") ||
                  secretsService.get("OPENCODE_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured. Add it in Settings > Secrets.");

  const lastUserMessage = messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: lastUserMessage }] }],
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini (OpenCode) error: ${res.status} ${res.statusText}`);

  // Gemini streams newline-delimited JSON
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "[" || trimmed === "," || trimmed === "]") continue;
      try {
        const json = JSON.parse(trimmed.replace(/^,/, ""));
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) {
          fullText += text;
          callbacks.onToken(text);
        }
      } catch {
        // partial JSON chunk, skip
      }
    }
  }
  callbacks.onDone(fullText);
}

// ─── SSE Stream Reader ─────────────────────────────────────────────────────
async function readSSEStream(res: Response, callbacks: StreamCallback): Promise<void> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const token = json?.choices?.[0]?.delta?.content ?? "";
        if (token) {
          fullText += token;
          callbacks.onToken(token);
        }
      } catch {
        // malformed chunk, skip
      }
    }
  }
  callbacks.onDone(fullText);
}

// ─── Public API ──────────────────────────────────────────────────────────────────
export async function streamCLI(
  provider: CLIProvider,
  command: string,
  history: ChatMessage[],
  callbacks: StreamCallback
): Promise<void> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are Nexus Alpha, an AI-powered build platform assistant. Help the user with code, builds, repos, pipelines, and AI tooling. Be concise and technical.",
    },
    ...history,
    { role: "user", content: command },
  ];

  try {
    switch (provider) {
      case "openrouter":
        await streamOpenRouter(messages, undefined, callbacks);
        break;
      case "deepseek":
        await streamDeepSeek(messages, undefined, callbacks);
        break;
      case "opencode":
      default:
        await streamOpenCode(messages, undefined, callbacks);
        break;
    }
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
