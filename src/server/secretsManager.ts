/**
 * Server-Side Secret Manager
 * Replaces client-side sessionStorage obfuscation with secure, per-user 
 * server-held state. In production, this should interface with 
 * Supabase Vault or a KMS.
 */

import { logAuditEvent } from './auditLogService';
import { supabaseData } from '../services/supabaseClient';

export type SecretKey =
  | "GEMINI_API_KEY"
  | "GITHUB_TOKEN"
  | "OPENROUTER_API_KEY"
  | "DEEPSEEK_API_KEY"
  | "SUPABASE_URL"
  | "SUPABASE_ANON_KEY"
  | "OPENCODE_API_KEY";

export const secretsManager = {
  async set(userId: string, key: SecretKey, value: string): Promise<void> {
    const { error } = await supabaseData
      .from('user_secrets')
      .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });

    if (error) throw new Error(`Secret store error: ${error.message}`);

    await logAuditEvent({
      actor: userId,
      action: 'secret_set',
      target: key,
      status: 'success',
      metadata: { key }
    }).catch(() => {});
  },

  async get(userId: string, key: SecretKey): Promise<string | null> {
    const { data, error } = await supabaseData
      .from('user_secrets')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .single();

    if (error || !data) return null;
    return data.value;
  },

  async remove(userId: string, key: SecretKey): Promise<void> {
    await supabaseData
      .from('user_secrets')
      .delete()
      .eq('user_id', userId)
      .eq('key', key);

    await logAuditEvent({
      actor: userId,
      action: 'secret_remove',
      target: key,
      status: 'success',
      metadata: { key }
    }).catch(() => {});
  },

  async list(userId: string): Promise<SecretKey[]> {
    const { data, error } = await supabaseData
      .from('user_secrets')
      .select('key')
      .eq('user_id', userId);

    if (error || !data) return [];
    return data.map(d => d.key as SecretKey);
  }
};
