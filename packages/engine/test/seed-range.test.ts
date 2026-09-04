import { describe, expect, it } from 'vitest';
import { randomSeed } from '../src/rng.ts';

describe('battle seeds', () => {
  it('stay inside the safe integer range for JSON transport', () => {
    let n = 0;
    const source = () => ((n = (n * 1103515245 + 12345) % 2147483648), n / 2147483648);
    for (let i = 0; i < 500; i += 1) {
      const seed = randomSeed(source);
      expect(seed).toBeGreaterThanOrEqual(0n);
      expect(Number(seed)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      expect(BigInt(Number(seed))).toBe(seed);
    }
  });
});
