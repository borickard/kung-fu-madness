import { describe, expect, it } from 'vitest';
import { resolveRound } from '../src/resolve.ts';
import { makeRng } from '../src/rng.ts';
import type { LogEvent, Side } from '../src/types.ts';
import { FLAT_SPREAD, FLYING_KICK, JAB, ROLL_MAX, ROLL_MIN, attack, scriptRng, state, submission } from './helpers.ts';

const attackerOf = (events: LogEvent[]): Side[] =>
  events.filter((e) => e.kind !== 'end').map((e) => (e as { attacker: Side }).attacker);

describe('resolution order', () => {
  it('breaks equal speed inside an exchange with the RNG, identically for identical seeds', () => {
    const both = submission([attack(JAB, 'HIGH')], ['LOW', 'LOW', 'LOW']);
    const orderFor = (seed: number): Side[] =>
      attackerOf(resolveRound({ state: state(), a: both, b: both, rng: makeRng(seed, 1) }).events);

    const orders = Array.from({ length: 24 }, (_unused, i) => orderFor(i + 1).join(''));
    // Both orders show up across seeds: insertion order is not what decides.
    expect(new Set(orders).size).toBeGreaterThan(1);
    // And the same seed always lands the same way.
    expect(orderFor(7)).toEqual(orderFor(7));
    expect(orderFor(7).join('')).toBe(orders[6]);
  });

  it('drops every remaining swing of a fighter knocked out earlier in the round', () => {
    // A is on 1 HP. B's Jab is faster than A's Flying Kick in the same
    // exchange, so A goes down before answering and never reaches exchange 2.
    const result = resolveRound({
      state: state({ hp: 1 }, {}),
      a: submission(
        [attack(FLYING_KICK, 'HIGH'), attack(FLYING_KICK, 'MID'), attack(FLYING_KICK, 'LOW')],
        ['LOW', 'LOW', 'LOW'],
      ),
      b: submission([attack(JAB, 'HIGH')], ['LOW', 'LOW', 'LOW']),
      rng: scriptRng({ floats: [0.1, 0.2, 0.3, 0.4, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
    });

    expect(attackerOf(result.events)).toEqual(['b']);
    expect(result.outcome).toBe('knockout');
    expect(result.winner).toBe('b');
  });
});
