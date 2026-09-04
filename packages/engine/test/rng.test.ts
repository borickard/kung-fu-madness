import { describe, expect, it } from 'vitest';
import { resolveRound } from '../src/resolve.ts';
import { makeRng, randomSeed } from '../src/rng.ts';
import { NOTHING, state, submission } from './helpers.ts';

describe('rng', () => {
  it('returns integers in [1, max] inclusive', () => {
    const rng = makeRng(42, 1);
    const draws = Array.from({ length: 2000 }, () => rng.int(6));
    expect(Math.min(...draws)).toBe(1);
    expect(Math.max(...draws)).toBe(6);
    expect(draws.every(Number.isInteger)).toBe(true);
  });

  it('returns floats in [0, 1)', () => {
    const rng = makeRng(42, 1);
    const draws = Array.from({ length: 2000 }, () => rng.float());
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
  });

  it('spreads roughly evenly across buckets', () => {
    const rng = makeRng(7, 3);
    const counts = new Map<number, number>();
    for (let i = 0; i < 4000; i += 1) {
      const face = rng.int(4);
      counts.set(face, (counts.get(face) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4]);
    for (const count of counts.values()) expect(count).toBeGreaterThan(800);
  });

  it('refuses a max below 1', () => {
    expect(() => makeRng(1, 1).int(0)).toThrow(RangeError);
  });

  it('builds a seed from an injected source, never from Math.random', () => {
    const source = () => 0.5;
    expect(randomSeed(source)).toBe(randomSeed(source));
    expect(randomSeed(source)).toBeGreaterThan(0n);
    expect(randomSeed(() => 0.25)).not.toBe(randomSeed(source));
  });
});

describe('unknown moves', () => {
  it('refuses to resolve an attack with a move that does not exist', () => {
    expect(() =>
      resolveRound({
        state: state(),
        a: submission([{ move_id: 999, zone: 'MID' }]),
        b: NOTHING,
        rng: makeRng(1, 1),
      }),
    ).toThrow(/unknown move_id 999/);
  });
});
