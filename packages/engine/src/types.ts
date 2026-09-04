/** Every target zone describes the *opponent's* body. */
export type Zone = 'HIGH' | 'MID' | 'LOW';

export const ZONES: readonly Zone[] = ['HIGH', 'MID', 'LOW'] as const;

export function isZone(value: unknown): value is Zone {
  return typeof value === 'string' && (ZONES as readonly string[]).includes(value);
}

/** Which side of a battle. `a` is `battles.fighter_a`. */
export type Side = 'a' | 'b';

export function other(side: Side): Side {
  return side === 'a' ? 'b' : 'a';
}

export interface Move {
  id: number;
  name: string;
  /** Base percentage chance to land, before the accuracy/evasion spread. */
  hit_pct: number;
  spd: number;
  avg_dmg: number;
  /** Stored, unused in v1. */
  range: number;
  crit_pct: number;
  crit_mult: number;
  eng: number;
  xp_cost: number;
}

export interface FighterState {
  hp: number;
  hp_max: number;
  energy: number;
  energy_max: number;
  strength: number;
  accuracy: number;
  evasion: number;
  toughness: number;
}

export interface BattleState {
  /** The round about to be resolved. One-based. */
  round_no: number;
  a: FighterState;
  b: FighterState;
}

export interface Attack {
  move_id: number;
  zone: Zone;
}

/**
 * Three attacks and three blocks, and the index matters: your attack 1 meets
 * their block 1, your attack 2 their block 2. Each pair is one exchange.
 */
export interface Submission {
  attacks: Attack[];
  blocks: Zone[];
}

export type LogEvent =
  | {
      kind: 'hit';
      attacker: Side;
      move: string;
      move_id: number;
      zone: Zone;
      exchange: number;
      amount: number;
      crit: boolean;
      hp_after: number;
    }
  | { kind: 'block'; attacker: Side; move: string; move_id: number; zone: Zone; exchange: number }
  | { kind: 'miss'; attacker: Side; move: string; move_id: number; zone: Zone; exchange: number }
  | { kind: 'fizzle'; attacker: Side; move: string; move_id: number; zone: Zone; exchange: number }
  | { kind: 'end'; outcome: Outcome; winner?: Side };

export type Outcome = 'continue' | 'knockout' | 'draw' | 'decision';

export interface RoundResult {
  state: BattleState;
  events: LogEvent[];
  outcome: Outcome;
  winner?: Side;
  /** Damage dealt this round, per side. Feeds XP without re-walking the log. */
  damage: { a: number; b: number };
}

/**
 * Injected randomness. The engine never creates one of these implicitly and
 * never calls `Math.random`.
 */
export interface Rng {
  /** Uniform integer in `[1, max]` inclusive, so percentages read exactly. */
  int(max: number): number;
  /** Uniform float in `[0, 1)`. */
  float(): number;
}
