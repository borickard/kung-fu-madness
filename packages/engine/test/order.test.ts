import { describe, expect, it } from 'vitest';
import { resolveRound } from '../src/resolve.ts';
import { makeRng } from '../src/rng.ts';
import type { LogEvent, Side } from '../src/types.ts';
import {
  FLAT_SPREAD,
  FLYING_KICK,
  FRONT_KICK,
  JAB,
  NOTHING,
  ROLL_MAX,
  ROLL_MIN,
  attack,
  scriptRng,
  state,
  submission,
} from './helpers.ts';

const attackerOf = (events: LogEvent[]): Side[] => events.filter((e) => e.kind !== 'end').map((e) => (e as { attacker: Side }).attacker);
const movesOf = (events: LogEvent[]): string[] => events.filter((e) => e.kind !== 'end').map((e) => (e as { move: string }).move);

describe('resolution order', () => {
  it('resolves attacks in descending speed', () => {
    // Submitted slowest first on purpose; speed, not submission order, decides.
    const a = submission([
      attack(FLYING_KICK, 'MID_LEFT'), // spd 3
      attack(FRONT_KICK, 'MID_LEFT'), // spd 5
      attack(JAB, 'MID_LEFT'), // spd 9
    ]);
    const result = resolveRound({
      state: state(),
      a,
      b: NOTHING,
      // three tie keys, then hit/spread/crit rolls for three landed attacks
      rng: scriptRng({
        floats: [0.1, 0.2, 0.3, FLAT_SPREAD, FLAT_SPREAD, FLAT_SPREAD],
        ints: [ROLL_MIN, ROLL_MAX, ROLL_MIN, ROLL_MAX, ROLL_MIN, ROLL_MAX],
      }),
    });

    expect(movesOf(result.events)).toEqual(['Jab', 'Front Kick', 'Flying Kick']);
  });

  it('breaks equal speed with the RNG, identically for identical seeds', () => {
    const both = submission([attack(JAB, 'MID_LEFT')]);
    const orderFor = (seed: number): Side[] =>
      attackerOf(
        resolveRound({ state: state(), a: both, b: both, rng: makeRng(seed, 1) }).events,
      );

    const orders = Array.from({ length: 24 }, (_unused, i) => orderFor(i + 1).join(''));
    // Both orders show up across seeds: insertion order is not what decides.
    expect(new Set(orders).size).toBeGreaterThan(1);
    // And the same seed always lands the same way.
    expect(orderFor(7)).toEqual(orderFor(7));
    expect(orderFor(7).join('')).toBe(orders[6]);
  });

  it('drops the remaining attacks of a fighter knocked out earlier in the round', () => {
    // A is on 1 HP. B's Jab (spd 9) lands first and finishes them, so A's
    // slower Flying Kick never happens.
    const result = resolveRound({
      state: state({ hp: 1 }, {}),
      a: submission([attack(FLYING_KICK, 'MID_LEFT')]),
      b: submission([attack(JAB, 'MID_LEFT')]),
      rng: scriptRng({ floats: [0.1, 0.2, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
    });

    expect(attackerOf(result.events)).toEqual(['b']);
    expect(result.outcome).toBe('knockout');
    expect(result.winner).toBe('b');
  });
});
