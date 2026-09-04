/**
 * Regenerate with `pnpm gen:types` after any migration. Kept in the repo so
 * the app typechecks without a database on the machine.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface FighterRow {
  id: string;
  user_id: string | null;
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
  is_bot: boolean;
  created_at: string;
}

export interface MoveRow {
  id: number;
  name: string;
  hit_pct: number;
  spd: number;
  avg_dmg: number;
  range: number;
  crit_pct: number;
  crit_mult: number;
  eng: number;
  xp_cost: number;
}

export interface FighterMoveRow {
  fighter_id: string;
  move_id: number;
  hidden: boolean;
}

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
  outcome: 'knockout' | 'decision' | 'draw' | 'walkover' | null;
  created_at: string;
  ended_at: string | null;
}

export interface SubmissionRow {
  battle_id: string;
  round_no: number;
  fighter_id: string;
  submitted_at: string;
  attacks: Json;
  blocks: Json;
}

export interface RoundLogRow {
  battle_id: string;
  round_no: number;
  events: Json;
  hp_a_after: number;
  hp_b_after: number;
  resolved_at: string;
}
