import { supabaseData } from '../../services/supabaseClient';

export async function saveSecretActivity(key: string, value: string): Promise<boolean> {
  return (supabaseData as any).saveSecret(key, value);
}

export async function getSecretActivity(key: string): Promise<string | null> {
  return (supabaseData as any).getSecret(key);
}

export async function logEventActivity(type: string, details: Record<string, unknown>): Promise<void> {
  await (supabaseData as any).logEvent(type, details);
}