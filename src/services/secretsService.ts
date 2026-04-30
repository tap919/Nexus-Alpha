/**
 * Secrets Manager
 * In-memory encrypted store for API keys and provider credentials.
 * Keys are stored in sessionStorage as base64 (obfuscated, not truly encrypted for browser env).
 * For production, wire to a server-side vault or Supabase Vault.
 */

export type SecretKey =
  | "GEMINI_API_KEY"
  | "GITHUB_TOKEN"
  | "OPENROUTER_API_KEY"
  | "DEEPSEEK_API_KEY"
  | "SUPABASE_URL"
  | "SUPABASE_ANON_KEY"
  | "OPENCODE_API_KEY";

const STORAGE_PREFIX = "__nexus_secret_";

function encode(value: string): string {
  return btoa(encodeURIComponent(value));
}

function decode(encoded: string): string {
  return decodeURIComponent(atob(encoded));
}

export const secretsService = {
  set(key: SecretKey, value: string): void {
    sessionStorage.setItem(STORAGE_PREFIX + key, encode(value));
  },

  get(key: SecretKey): string | null {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    try {
      return decode(raw);
    } catch {
      return null;
    }
  },

  remove(key: SecretKey): void {
    sessionStorage.removeItem(STORAGE_PREFIX + key);
  },

  clear(): void {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  },

  list(): SecretKey[] {
    const keys: SecretKey[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) {
        keys.push(k.replace(STORAGE_PREFIX, "") as SecretKey);
      }
    }
    return keys;
  },

  has(key: SecretKey): boolean {
    return sessionStorage.getItem(STORAGE_PREFIX + key) !== null;
  },

  /** Mask value for display: shows only last 4 chars */
  mask(key: SecretKey): string {
    const value = this.get(key);
    if (!value) return "(not set)";
    if (value.length <= 4) return "****";
    return `${"..".repeat(4)}${value.slice(-4)}`;
  },
};

/** Provider metadata */
export const PROVIDER_CONFIGS: Record<
  string,
  { label: string; key: SecretKey; baseUrl: string; docsUrl: string }
> = {
  gemini: {
    label: "Google Gemini",
    key: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com",
    docsUrl: "https://ai.google.dev/docs",
  },
  github: {
    label: "GitHub",
    key: "GITHUB_TOKEN",
    baseUrl: "https://api.github.com",
    docsUrl: "https://docs.github.com/en/rest",
  },
  openrouter: {
    label: "OpenRouter",
    key: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/docs",
  },
  deepseek: {
    label: "DeepSeek",
    key: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    docsUrl: "https://platform.deepseek.com/docs",
  },
  supabase: {
    label: "Supabase",
    key: "SUPABASE_ANON_KEY",
    baseUrl: "https://supabase.com",
    docsUrl: "https://supabase.com/docs",
  },
};
