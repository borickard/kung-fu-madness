import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env.local — `pnpm supabase start` prints both.',
  );
}

export const supabase = createClient(url, anonKey);

/**
 * Call an edge function. Every write of consequence goes through one of these:
 * the browser never resolves a round and never writes a battle row.
 */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const detail = await readFunctionError(error);
    throw new Error(detail);
  }
  return data as T;
}

async function readFunctionError(error: unknown): Promise<string> {
  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === 'function') {
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // fall through to the generic message
    }
  }
  return error instanceof Error ? error.message : 'that did not work';
}
