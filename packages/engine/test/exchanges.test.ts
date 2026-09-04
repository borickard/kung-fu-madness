import { describe, expect, it } from 'vitest';
import { resolveRound } from '../src/resolve.ts';
import type { LogEvent, Move } from '../src/types.ts';
import {
  FLAT_SPREAD,
  FLYING_KICK,
  JAB,
  KICK,
  NOTHING,
  PUNCH,
  ROLL_MAX,
  ROLL_MIN,
  attack,
  scriptRng,
  state,
  submission,
} from './helpers.ts';

const kinds = (events: LogEvent[]) => events.map((e) => e.kind);
const hitOf = (events: LogEvent[]) => {
  const hit = events.find((e) => e.kind === 'hit');
  if (!hit || hit.kind !== 'hit') throw new Error('expected a hit event');
  return hit;
};

describe('an exchange', () => {
  it('is stopped by the block in the same slot', () => {
    const result = resolveRound({
      state: state(),
      a: submission([attack(JAB, 'HIGH')]),
      b: submission([], ['HIGH', 'LOW', 'LOW']),
      // One tie key and nothing else: a block never reaches the dice.
      rng: scriptRng({ floats: [0.1], ints: [] }),
    });

    expect(result.events[0]).toMatchObject({ kind: 'block', zone: 'HIGH', exchange: 1 });
    expect(result.damage).toEqual({ a: 0, b: 0 });
    expect(result.state.b.hp).toBe(1000);
  });

  it('is not saved by guarding the same zone in a different slot', () => {
    // The block on HIGH is in exchange 2; the attack comes in exchange 1.
    const result = resolveRound({
      state: state(),
      a: submission([attack(JAB, 'HIGH')]),
      b: submission([], ['LOW', 'HIGH', 'HIGH']),
      rng: scriptRng({ floats: [0.1, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
    });

    expect(kinds(result.events)).toEqual(['hit']);
    expect(hitOf(result.events).amount).toBe(7);
  });

  it('costs the attacker energy whether it lands or is stopped', () => {
    const blocked = resolveRound({
      state: state({ energy: 20 }, {}),
      a: submission([attack(KICK, 'MID')]),
      b: submission([], ['MID', 'MID', 'MID']),
      rng: scriptRng({ floats: [0.1], ints: [] }),
    });
    expect(blocked.events[0]?.kind).toBe('block');
    expect(blocked.state.a.energy).toBe(20 + 5 - KICK.eng);
  });

  it('lets a crit through on anything the defender guessed wrong', () => {
    const alwaysCrits: Move = { ...FLYING_KICK, crit_pct: 100 };
    const result = resolveRound({
      state: state({ strength: 25 }, {}),
      a: submission([attack(alwaysCrits, 'LOW')]),
      b: submission([], ['HIGH', 'HIGH', 'HIGH']),
      rng: scriptRng({ floats: [0.1, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
      moves: new Map([[alwaysCrits.id, alwaysCrits]]),
    });
    // 38 * 2.00 for strength, then 2.5 for the crit.
    expect(hitOf(result.events)).toMatchObject({ crit: true, amount: 190 });
  });

  it('resolves all three exchanges in order, whatever the speeds', () => {
    // A slow move in exchange 1 still lands before a fast one in exchange 3.
    const result = resolveRound({
      state: state(),
      a: submission([attack(FLYING_KICK, 'HIGH'), attack(PUNCH, 'MID'), attack(JAB, 'LOW')]),
      b: NOTHING,
      rng: scriptRng({
        floats: [0.1, 0.2, 0.3, FLAT_SPREAD, FLAT_SPREAD, FLAT_SPREAD],
        ints: [ROLL_MIN, ROLL_MAX, ROLL_MIN, ROLL_MAX, ROLL_MIN, ROLL_MAX],
      }),
    });

    expect(result.events.map((e) => (e.kind === 'hit' ? e.move : e.kind))).toEqual([
      'Flying Kick',
      'Punch',
      'Jab',
    ]);
    expect(result.events.map((e) => (e.kind === 'end' ? 0 : e.exchange))).toEqual([1, 2, 3]);
  });

  it('lets the faster fighter land first inside one exchange', () => {
    const result = resolveRound({
      state: state(),
      a: submission([attack(FLYING_KICK, 'HIGH')]),
      b: submission([attack(JAB, 'HIGH')]),
      rng: scriptRng({
        floats: [0.1, 0.2, FLAT_SPREAD, FLAT_SPREAD],
        ints: [ROLL_MIN, ROLL_MAX, ROLL_MIN, ROLL_MAX],
      }),
    });

    // Jab is spd 9, Flying Kick spd 3, so B answers first despite A being listed first.
    expect(result.events.map((e) => (e.kind === 'end' ? 'end' : e.attacker))).toEqual(['b', 'a']);
  });

  it('blocks each of the three exchanges independently', () => {
    const result = resolveRound({
      state: state(),
      a: submission([attack(JAB, 'HIGH'), attack(JAB, 'MID'), attack(JAB, 'LOW')]),
      b: submission([], ['HIGH', 'LOW', 'LOW']),
      rng: scriptRng({ floats: [0.1, 0.2, 0.3, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
    });

    // Guessed exchange 1 and 3, missed exchange 2.
    expect(kinds(result.events)).toEqual(['block', 'hit', 'block']);
  });
});
