import { MOVES } from '../src/balance.ts';
import type { Attack, BattleState, FighterState, Move, Rng, Submission, Zone } from '../src/types.ts';

function byName(name: string): Move {
  const move = MOVES.find((m) => m.name === name);
  if (!move) throw new Error(`no move named ${name}`);
  return move;
}

export const JAB = byName('Jab');
export const HIGH_PUNCH = byName('High Punch');
export const LOW_PUNCH = byName('Low Punch');
export const FRONT_KICK = byName('Front Kick');
export const SWEEP = byName('Sweep');
export const ELBOW = byName('Elbow');
export const ROUNDHOUSE = byName('Roundhouse');
export const FLYING_KICK = byName('Flying Kick');

/** A deliberately blank fighter: nothing scales damage unless a test says so. */
export function fighter(overrides: Partial<FighterState> = {}): FighterState {
  return {
    hp: 1000,
    hp_max: 1000,
    energy: 100,
    energy_max: 100,
    strength: 0,
    accuracy: 0,
    evasion: 0,
    toughness: 0,
    ...overrides,
  };
}

export function state(
  a: Partial<FighterState> = {},
  b: Partial<FighterState> = {},
  round_no = 1,
): BattleState {
  return { round_no, a: fighter(a), b: fighter(b) };
}

export function attack(move: Move, zone: Zone): Attack {
  return { move_id: move.id, zone };
}

export function submission(attacks: Attack[], blocks: Zone[] = []): Submission {
  return { attacks, blocks };
}

/** Empty submission: no attacks, no blocks. */
export const NOTHING: Submission = { attacks: [], blocks: [] };

/**
 * An RNG whose every draw is written down in the test. Exhausting either list
 * throws, so a test can never silently depend on an unplanned roll.
 */
export function scriptRng(script: { floats?: number[]; ints?: number[] }): Rng {
  const floats = [...(script.floats ?? [])];
  const ints = [...(script.ints ?? [])];
  return {
    float(): number {
      if (floats.length === 0) throw new Error('scriptRng: ran out of floats');
      return floats.shift() as number;
    },
    int(_max: number): number {
      if (ints.length === 0) throw new Error('scriptRng: ran out of ints');
      return ints.shift() as number;
    },
  };
}

/** Spread roll that makes the damage variance term exactly 1.0. */
export const FLAT_SPREAD = 0.5;
/** An int roll that hits nothing and crits nothing. */
export const ROLL_MAX = 100;
/** An int roll that hits everything and crits everything. */
export const ROLL_MIN = 1;
