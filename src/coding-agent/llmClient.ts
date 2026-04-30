import { logger } from '../lib/logger';

const CTX = 'CodingAgentLLM';

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
}

let geminiKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '';
let openrouterKey = typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY : '';

export function setApiKeys(gemini?: string, openrouter?: string): void {
  if (gemini) geminiKey = gemini;
  if (openrouter) openrouterKey = openrouter;
}

export interface GenerateTextOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: 'gemini' | 'openrouter' | 'ollama';
}

export function isOffline(): boolean {
  return !geminiKey && !openrouterKey;
}

export async function generateText(
  prompt: string,
  options?: GenerateTextOptions,
): Promise<LLMResponse> {
  const preferred = options?.preferredProvider;

  if (preferred === 'ollama') {
    try {
      return await callOllama(prompt, options);
    } catch (err) {
      logger.error(CTX, 'Ollama (preferred) failed', err);
      throw new Error(`Ollama generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (preferred === 'gemini' && geminiKey) {
    return callGemini(prompt, options);
  }
  if (preferred === 'openrouter' && openrouterKey) {
    return callOpenRouter(prompt, options);
  }

  if (geminiKey) {
    try {
      return await callGemini(prompt, options);
    } catch (err) {
      logger.warn(CTX, 'Gemini failed, trying fallback', err);
    }
  }

  if (openrouterKey) {
    try {
      return await callOpenRouter(prompt, options);
    } catch (err) {
      logger.warn(CTX, 'OpenRouter failed', err);
    }
  }

  try {
    logger.info(CTX, 'No cloud API keys configured, attempting Ollama...');
    return await callOllama(prompt, options);
  } catch (err) {
    logger.warn(CTX, 'Ollama unavailable', err);
  }

  logger.warn(CTX, 'All providers failed, using stub response');
  return {
    text: 'Unable to generate: no API keys configured and Ollama is unreachable. Set GEMINI_API_KEY, OPENROUTER_API_KEY, or run Ollama locally.',
    provider: 'stub',
    model: 'stub',
  };
}

async function callGemini(
  prompt: string,
  options?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<LLMResponse> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const model = options?.model || 'gemini-2.0-flash';

  const result = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 8192,
    },
  });

  return {
    text: result.text ?? '',
    provider: 'gemini',
    model,
  };
}

async function callOpenRouter(
  prompt: string,
  options?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<LLMResponse> {
  const model = options?.model || 'google/gemini-2.0-flash-001';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 8192,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter HTTP ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    provider: 'openrouter',
    model,
  };
}

async function callOllama(
  prompt: string,
  options?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<LLMResponse> {
  const { generateWithOllama } = await import('./providers/ollamaProvider');
  const result = await generateWithOllama(prompt, {
    model: options?.model,
    temperature: options?.temperature ?? 0.3,
  });
  return {
    text: result.text,
    provider: 'ollama',
    model: result.model,
  };
}

export async function generateJson<T>(
  prompt: string,
  options?: { model?: string; temperature?: number; maxTokens?: number },
): Promise<T> {
  const jsonPrompt = `${prompt}\n\nRespond ONLY with valid JSON. No markdown, no explanation.`;
  const result = await generateText(jsonPrompt, { ...options, temperature: 0.1 });

  const cleaned = result.text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const braceStart = cleaned.indexOf('{');
    const braceEnd = cleaned.lastIndexOf('}');
    if (braceStart >= 0 && braceEnd > braceStart) {
      try {
        return JSON.parse(cleaned.slice(braceStart, braceEnd + 1)) as T;
      } catch {}
    }
    throw new Error(`Failed to parse JSON from LLM response: ${cleaned.slice(0, 200)}`);
  }
}
