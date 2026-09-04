import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { STARTING_FIGHTER, STARTING_MOVE_IDS, randomSeed } from 'engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The security tests from SPEC section 10, at integration level. They need a
 * local stack:
 *
 *   pnpm supabase start && pnpm supabase db reset
 *   KFM_INTEGRATION=1 \
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm --filter web test
 *
 * Without those they are skipped, loudly.
 */
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(process.env.KFM_INTEGRATION && url && anonKey && serviceKey);

if (!enabled) {
  console.warn('[rls] skipped: set KFM_INTEGRATION, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
}

const stamp = Date.now();
const people = {
  a: { email: `kfm-a-${stamp}@example.test`, password: 'correct-horse-a' },
  b: { email: `kfm-b-${stamp}@example.test`, password: 'correct-horse-b' },
};

describe.skipIf(!enabled)('row level security', () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let fighterA = '';
  let fighterB = '';
  let battleId = '';
  const userIds: string[] = [];

  async function makeUser(person: { email: string; password: string }): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return data.user.id;
  }

  async function makeFighter(user_id: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from('fighters')
      .insert({
        user_id,
        name,
        belt: 0,
        xp: 0,
        hp_max: STARTING_FIGHTER.hp_max,
        energy_max: STARTING_FIGHTER.energy_max,
        strength: STARTING_FIGHTER.strength,
        accuracy: STARTING_FIGHTER.accuracy,
        evasion: STARTING_FIGHTER.evasion,
        toughness: STARTING_FIGHTER.toughness,
        wins: 0,
        losses: 0,
        draws: 0,
        is_listed_in_arena: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    await admin
      .from('fighter_moves')
      .insert(STARTING_MOVE_IDS.map((move_id) => ({ fighter_id: data.id, move_id })));
    return data.id as string;
  }

  async function signedIn(person: { email: string; password: string }): Promise<SupabaseClient> {
    const client = createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword(person);
    if (error) throw new Error(error.message);
    return client;
  }

  beforeAll(async () => {
    admin = createClient(url as string, serviceKey as string, { auth: { persistSession: false } });

    userIds.push(await makeUser(people.a), await makeUser(people.b));
    fighterA = await makeFighter(userIds[0] as string, `Ada ${stamp}`);
    fighterB = await makeFighter(userIds[1] as string, `Bo ${stamp}`);

    const { data, error } = await admin
      .from('battles')
      .insert({
        fighter_a: fighterA,
        fighter_b: fighterB,
        status: 'active',
        round_no: 1,
        seed: Number(randomSeed(() => 0.5)),
        hp_a: STARTING_FIGHTER.hp_max,
        hp_b: STARTING_FIGHTER.hp_max,
        energy_a: STARTING_FIGHTER.energy_max,
        energy_b: STARTING_FIGHTER.energy_max,
        deadline_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    battleId = data.id as string;

    clientA = await signedIn(people.a);
    clientB = await signedIn(people.b);
  }, 30_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from('battles').delete().eq('id', battleId);
    await admin.from('fighters').delete().in('id', [fighterA, fighterB]);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it('lets a fighter write and read their own submission', async () => {
    const { error } = await clientA.from('submissions').insert({
      battle_id: battleId,
      round_no: 1,
      fighter_id: fighterA,
      attacks: [{ move_id: 1, zone: 'MID_LEFT' }],
      blocks: ['MID_LEFT', 'MID_RIGHT', 'HIGH_RIGHT'],
    });
    expect(error).toBeNull();

    const { data } = await clientA.from('submissions').select('*').eq('battle_id', battleId);
    expect(data).toHaveLength(1);
  });

  it("returns zero rows when B selects A's submission for an unresolved round", async () => {
    const { data, error } = await clientB
      .from('submissions')
      .select('*')
      .eq('battle_id', battleId)
      .eq('fighter_id', fighterA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns zero rows when B selects every submission it can reach', async () => {
    const { data } = await clientB.from('submissions').select('*');
    expect(data).toEqual([]);
  });

  it('refuses a submission written on behalf of the other fighter', async () => {
    const { error } = await clientB.from('submissions').insert({
      battle_id: battleId,
      round_no: 1,
      fighter_id: fighterA,
      attacks: [],
      blocks: [],
    });
    expect(error).not.toBeNull();
  });

  it('rejects a direct client update of battles.hp_a', async () => {
    const { data, error } = await clientB
      .from('battles')
      .update({ hp_a: 1 })
      .eq('id', battleId)
      .select();
    // No write policy exists, so the update either errors or matches nothing.
    expect(error !== null || (data ?? []).length === 0).toBe(true);

    const { data: after } = await admin.from('battles').select('hp_a').eq('id', battleId).single();
    expect(after?.hp_a).toBe(STARTING_FIGHTER.hp_max);
  });

  it('rejects a client handing itself XP', async () => {
    const { error } = await clientA
      .from('fighters')
      .update({ xp: 999_999 })
      .eq('id', fighterA)
      .select();
    expect(error).not.toBeNull();

    const { data: after } = await admin.from('fighters').select('xp').eq('id', fighterA).single();
    expect(after?.xp).toBe(0);
  });

  it('still lets a fighter toggle their own arena listing', async () => {
    const { error } = await clientA
      .from('fighters')
      .update({ is_listed_in_arena: false })
      .eq('id', fighterA);
    expect(error).toBeNull();
  });

  it('shows no round logs before a round has resolved', async () => {
    const { data } = await clientB.from('round_logs').select('*').eq('battle_id', battleId);
    expect(data ?? []).toEqual([]);
  });
});
