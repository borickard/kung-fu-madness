import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

/** Bypasses RLS. The only writer to battles, submissions and round_logs. */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

export interface FighterRow {
  id: string;
  user_id: string;
  name: string;
  belt: number;
  xp: number;
  hp_max: number;
  energy_max: number;
  strength: number;
  accuracy: number;
  evasion: number;
  toughness: number;
  wins: number;
  losses: number;
  draws: number;
  is_listed_in_arena: boolean;
}

export async function requireUser(req: Request, admin: SupabaseClient): Promise<{ id: string }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'not signed in');

  // Validate the caller's access token with the service client, so the
  // function needs no publishable key of its own — the CLI does not inject one.
  const token = authorization.replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'not signed in');
  return { id: data.user.id };
}

/** The caller's own fighter, loaded with the service role. */
export async function requireFighter(req: Request, admin: SupabaseClient): Promise<FighterRow> {
  const user = await requireUser(req, admin);
  const { data, error } = await admin
    .from('fighters')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'no fighter yet');
  return data as FighterRow;
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'expected a JSON body');
  }
}
