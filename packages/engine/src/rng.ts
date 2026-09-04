import type { Rng } from './types.ts';

const MASK64 = 0xffffffffffffffffn;
const GOLDEN = 0x9e3779b97f4a7c15n;
const MUL_A = 0xbf58476d1ce4e5b9n;
const MUL_B = 0x94d049bb133111ebn;
const TWO_53 = 9007199254740992; // 2 ** 53

function splitmix64(state: bigint): { value: bigint; state: bigint } {
  const next = (state + GOLDEN) & MASK64;
  let z = next;
  z = ((z ^ (z >> 30n)) * MUL_A) & MASK64;
  z = ((z ^ (z >> 27n)) * MUL_B) & MASK64;
  z = z ^ (z >> 31n);
  return { value: z, state: next };
}

/**
 * The only source of randomness in a battle. Deterministic in
 * `(seed, round_no)`: the same pair always yields the same stream.
 */
export function makeRng(seed: bigint | number | string, round_no: number): Rng {
  let state = (BigInt(seed) ^ (BigInt(round_no) * GOLDEN)) & MASK64;

  function next(): bigint {
    const stepped = splitmix64(state);
    state = stepped.state;
    return stepped.value;
  }

  return {
    float(): number {
      return Number(next() >> 11n) / TWO_53;
    },
    int(max: number): number {
      if (max < 1) throw new RangeError('rng.int(max) requires max >= 1');
      return 1 + Math.floor((Number(next() >> 11n) / TWO_53) * max);
    },
  };
}

/**
 * A battle seed, produced outside the engine and stored on the battle row.
 * Kept under 2^53 so it survives a trip through JSON as a plain number.
 */
export function randomSeed(randomSource: () => number): bigint {
  const hi = BigInt(Math.floor(randomSource() * 0x200000)); // 21 bits
  const lo = BigInt(Math.floor(randomSource() * 0x100000000)); // 32 bits
  return (hi << 32n) | lo;
}
