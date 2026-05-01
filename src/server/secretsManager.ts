/**
 * Server-Side Secret Manager
 * Replaces client-side sessionStorage obfuscation with secure, per-user 
 * server-held state. In production, this should interface with 
 * Supabase Vault or a KMS.
 */

import { logAuditEvent } from './auditLogService';

export type SecretKey =
  | "GEMINI_API_KEY"
  | "GITHUB_TOKEN"
  | "OPENROUTER_API_KEY"
  | "DEEPSEEK_API_KEY"
  | "SUPABASE_URL"
  | "SUPABASE_ANON_KEY"
  | "OPENCODE_API_KEY";

// In-memory store (volatile). Backed by encryption-at-rest in production.
const userSecrets = new Map<string, Map<SecretKey, string>>();

export const secretsManager = {
  async set(userId: string, key: SecretKey, value: string): Promise<void> {
    if (!userSecrets.has(userId)) {
      userSecrets.set(userId, new Map());
    }
    userSecrets.get(userId)!.set(key, value);

    await logAuditEvent({
      actor: userId,
      action: 'secret_set',
      target: key,
      status: 'success',
      metadata: { key }
    }).catch(() => {});
  },

  get(userId: string, key: SecretKey): string | null {
    return userSecrets.get(userId)?.get(key) || null;
  },

  async remove(userId: string, key: SecretKey): Promise<void> {
    userSecrets.get(userId)?.delete(key);
    await logAuditEvent({
      actor: userId,
      action: 'secret_remove',
      target: key,
      status: 'success',
      metadata: { key }
    }).catch(() => {});
  },

  list(userId: string): SecretKey[] {
    const map = userSecrets.get(userId);
    return map ? Array.from(map.keys()) : [];
  }
};
