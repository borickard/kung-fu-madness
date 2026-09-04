import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEADLINE_HOURS,
  REPEAT_OPPONENT_WINDOW_HOURS,
  battleXp,
  beltForXp,
  botSubmission,
  makeRng,
  resolveRound,
  zonesAttackedBy,
  type BattleState,
  type FighterState,
  type LogEvent,
  type Side,
  type Submission,
} from 'engine';
import { HttpError } from './http.ts';
import type { FighterRow } from './supabase.ts';

export interface BattleRow {
  id: string;
  fighter_a: string;
  fighter_b: string;
  status: 'pending' | 'active' | 'finished';
  round_no: number;
  seed: number;
  hp_a: number;
  hp_b: number;
  energy_a: number;
  energy_b: number;
  deadline_at: string | null;
  timeouts_a: number;
  timeouts_b: number;
  winner_id: string | null;
  outcome: string | null;
}

const HOUR_MS = 3_600_000;

export function deadlineFrom(now: Date): string {
  return new Date(now.getTime() + DEADLINE_HOURS * HOUR_MS).toISOString();
}

export async function loadBattle(admin: SupabaseClient, id: string): Promise<BattleRow> {
  const { data, error } = await admin.from('battles').select('*').eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'no such battle');
  return data as BattleRow;
}

export async function loadFighters(
  admin: SupabaseClient,
  battle: BattleRow,
): Promise<{ a: FighterRow; b: FighterRow }> {
  const { data, error } = await admin
    .from('fighters')
    .select('*')
    .in('id', [battle.fighter_a, battle.fighter_b]);
  if (error) throw new HttpError(500, error.message);
  const a = (data ?? []).find((f) => f.id === battle.fighter_a) as FighterRow | undefined;
  const b = (data ?? []).find((f) => f.id === battle.fighter_b) as FighterRow | undefined;
  if (!a || !b) throw new HttpError(404, 'a fighter has left the building');
  return { a, b };
}

export function sideOf(battle: BattleRow, fighter_id: string): Side {
  if (fighter_id === battle.fighter_a) return 'a';
  if (fighter_id === battle.fighter_b) return 'b';
  throw new HttpError(403, 'not your battle');
}

export function fighterStateOf(battle: BattleRow, side: Side, f: FighterRow): FighterState {
  return {
    hp: side === 'a' ? battle.hp_a : battle.hp_b,
    hp_max: f.hp_max,
    energy: side === 'a' ? battle.energy_a : battle.energy_b,
    energy_max: f.energy_max,
    strength: f.strength,
    accuracy: f.accuracy,
    evasion: f.evasion,
    toughness: f.toughness,
  };
}

function stateOf(battle: BattleRow, fighters: { a: FighterRow; b: FighterRow }): BattleState {
  return {
    round_no: battle.round_no,
    a: fighterStateOf(battle, 'a', fighters.a),
    b: fighterStateOf(battle, 'b', fighters.b),
  };
}

/**
 * Play any bot in this battle that has not committed the current round. The
 * bot's hand is dealt here, with the service role, and never in the browser.
 */
export async function ensureBotSubmissions(
  admin: SupabaseClient,
  battle: BattleRow,
  fighters: { a: FighterRow; b: FighterRow },
): Promise<void> {
  for (const side of ['a', 'b'] as const) {
    const bot = fighters[side];
    if (!bot.is_bot) continue;

    const { data: owned, error: ownedError } = await admin
      .from('fighter_moves')
      .select('move_id')
      .eq('fighter_id', bot.id);
    if (ownedError) throw new HttpError(500, ownedError.message);

    const { data: logs, error: logError } = await admin
      .from('round_logs')
      .select('events')
      .eq('battle_id', battle.id)
      .order('round_no', { ascending: true });
    if (logError) throw new HttpError(500, logError.message);

    const opponent: Side = side === 'a' ? 'b' : 'a';
    const seen = zonesAttackedBy(
      opponent,
      (logs ?? []).map((row) => ({ events: (row.events ?? []) as LogEvent[] })),
    );

    const submission = botSubmission({
      seed: battle.seed,
      round_no: battle.round_no,
      self: fighterStateOf(battle, side, bot),
      moveIds: (owned ?? []).map((row) => row.move_id as number),
      seen,
    });

    const { error } = await admin.from('submissions').insert({
      battle_id: battle.id,
      round_no: battle.round_no,
      fighter_id: bot.id,
      attacks: submission.attacks,
      blocks: submission.blocks,
    });
    // 23505 means it already committed this round, which is not a problem.
    if (error && error.code !== '23505') throw new HttpError(500, error.message);
  }
}

/** Damage dealt across every round already on the record. */
async function damageSoFar(
  admin: SupabaseClient,
  battle: BattleRow,
): Promise<{ a: number; b: number }> {
  const { data, error } = await admin
    .from('round_logs')
    .select('events')
    .eq('battle_id', battle.id);
  if (error) throw new HttpError(500, error.message);

  const total = { a: 0, b: 0 };
  for (const row of data ?? []) {
    for (const event of (row.events ?? []) as LogEvent[]) {
      if (event.kind === 'hit') total[event.attacker] += event.amount;
    }
  }
  return total;
}

/** Battles between the same two fighters that ended inside the decay window. */
async function priorBattlesInWindow(
  admin: SupabaseClient,
  battle: BattleRow,
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - REPEAT_OPPONENT_WINDOW_HOURS * HOUR_MS).toISOString();
  const pair = [battle.fighter_a, battle.fighter_b];
  const { count, error } = await admin
    .from('battles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'finished')
    .gte('ended_at', since)
    .in('fighter_a', pair)
    .in('fighter_b', pair)
    .neq('id', battle.id);
  if (error) throw new HttpError(500, error.message);
  return count ?? 0;
}

export interface ResolutionOutcome {
  resolved: boolean;
  battle: BattleRow;
  events?: LogEvent[];
}

/**
 * Resolve the current round if both submissions are in. Called by
 * `submit-round` after an insert and by `sweep-deadlines` after defaulting a
 * missing player. The engine does the thinking; `commit_round` does the write.
 */
export async function resolveIfReady(
  admin: SupabaseClient,
  battle: BattleRow,
  timeouts: { a: number; b: number },
  now: Date,
): Promise<ResolutionOutcome> {
  const { data, error } = await admin
    .from('submissions')
    .select('fighter_id, attacks, blocks')
    .eq('battle_id', battle.id)
    .eq('round_no', battle.round_no);
  if (error) throw new HttpError(500, error.message);

  const rows = data ?? [];
  const find = (fighter_id: string): Submission | undefined => {
    const row = rows.find((r) => r.fighter_id === fighter_id);
    return row ? { attacks: row.attacks, blocks: row.blocks } : undefined;
  };
  const a = find(battle.fighter_a);
  const b = find(battle.fighter_b);
  if (!a || !b) return { resolved: false, battle };

  const fighters = await loadFighters(admin, battle);
  const result = resolveRound({
    state: stateOf(battle, fighters),
    a,
    b,
    rng: makeRng(battle.seed, battle.round_no),
  });

  const finished = result.outcome !== 'continue';
  const winnerId =
    result.winner === 'a' ? battle.fighter_a : result.winner === 'b' ? battle.fighter_b : null;

  let xp = { a: 0, b: 0 };
  let belts: { a: number | null; b: number | null } = { a: null, b: null };
  if (finished) {
    const earlier = await damageSoFar(admin, battle);
    xp = battleXp({
      outcome: result.outcome,
      ...(result.winner ? { winner: result.winner } : {}),
      damage: { a: earlier.a + result.damage.a, b: earlier.b + result.damage.b },
      belt: { a: fighters.a.belt, b: fighters.b.belt },
      priorBattlesInWindow: await priorBattlesInWindow(admin, battle, now),
    });
    // A bot earns nothing and never moves up: it is a training partner, and
    // its belt is the whole point of picking it.
    if (fighters.a.is_bot) xp.a = 0;
    if (fighters.b.is_bot) xp.b = 0;
    belts = {
      a: fighters.a.is_bot ? null : beltForXp(fighters.a.xp + xp.a),
      b: fighters.b.is_bot ? null : beltForXp(fighters.b.xp + xp.b),
    };
  }

  const { data: committed, error: commitError } = await admin.rpc('commit_round', {
    p_battle: battle.id,
    p_round: battle.round_no,
    p_events: result.events,
    p_hp_a: result.state.a.hp,
    p_hp_b: result.state.b.hp,
    p_energy_a: result.state.a.energy,
    p_energy_b: result.state.b.energy,
    p_next_round: result.state.round_no,
    p_deadline: deadlineFrom(now),
    p_timeouts_a: timeouts.a,
    p_timeouts_b: timeouts.b,
    p_finished: finished,
    p_outcome: finished ? result.outcome : null,
    p_winner: winnerId,
    p_xp_a: xp.a,
    p_xp_b: xp.b,
    p_belt_a: belts.a,
    p_belt_b: belts.b,
  });
  if (commitError) throw new HttpError(409, commitError.message);

  return { resolved: true, battle: committed as BattleRow, events: result.events };
}

/**
 * End a battle without resolving a round: three consecutive no-shows. The
 * winner is paid for the damage they did land, on the same terms as any win.
 */
export async function finishWalkover(
  admin: SupabaseClient,
  battle: BattleRow,
  winner: Side | null,
  now: Date,
): Promise<BattleRow> {
  const fighters = await loadFighters(admin, battle);
  const damage = await damageSoFar(admin, battle);
  const xp = battleXp({
    outcome: 'walkover',
    ...(winner ? { winner } : {}),
    damage,
    belt: { a: fighters.a.belt, b: fighters.b.belt },
    priorBattlesInWindow: await priorBattlesInWindow(admin, battle, now),
  });

  const { data, error } = await admin.rpc('finish_battle', {
    p_battle: battle.id,
    p_outcome: 'walkover',
    p_winner: winner === 'a' ? battle.fighter_a : winner === 'b' ? battle.fighter_b : null,
    p_xp_a: xp.a,
    p_xp_b: xp.b,
    p_belt_a: beltForXp(fighters.a.xp + xp.a),
    p_belt_b: beltForXp(fighters.b.xp + xp.b),
  });
  if (error) throw new HttpError(409, error.message);
  return data as BattleRow;
}
