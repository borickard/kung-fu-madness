import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRound } from '../src/resolve.ts';
import { makeRng } from '../src/rng.ts';
import { FLYING_KICK, JAB, ROUNDHOUSE, attack, state, submission } from './helpers.ts';

const SEED = 20031121n;

const A = submission(
  [attack(JAB, 'HIGH_LEFT'), attack(ROUNDHOUSE, 'MID_RIGHT'), attack(FLYING_KICK, 'LOW_LEFT')],
  ['MID_LEFT', 'MID_LEFT', 'HIGH_RIGHT'],
);
const B = submission(
  [attack(JAB, 'MID_LEFT'), attack(JAB, 'MID_LEFT'), attack(ROUNDHOUSE, 'HIGH_RIGHT')],
  ['HIGH_LEFT', 'MID_RIGHT', 'LOW_LEFT'],
);

const run = (seed: bigint | number, round_no: number) =>
  resolveRound({
    state: state({ strength: 4, accuracy: 3 }, { toughness: 2, evasion: 2 }, round_no),
    a: A,
    b: B,
    rng: makeRng(seed, round_no),
  });

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const SRC = new URL('../src', import.meta.url).pathname;

/** Strip comments, so prose about `Math.random` is not mistaken for a call. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('determinism', () => {
  it('produces byte-identical events for the same seed, round and submissions', () => {
    expect(JSON.stringify(run(SEED, 3).events)).toBe(JSON.stringify(run(SEED, 3).events));
    expect(JSON.stringify(run(SEED, 3).state)).toBe(JSON.stringify(run(SEED, 3).state));
  });

  it('diverges on a different round number or a different seed', () => {
    const base = JSON.stringify(run(SEED, 3).events);
    expect(JSON.stringify(run(SEED, 4).events)).not.toBe(base);
    expect(JSON.stringify(run(SEED + 1n, 3).events)).not.toBe(base);
  });

  it('never mutates the state it was handed', () => {
    const before = state({ strength: 4 }, {}, 2);
    const snapshot = JSON.stringify(before);
    resolveRound({ state: before, a: A, b: B, rng: makeRng(SEED, 2) });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('purity', () => {
  const files = sourceFiles(SRC);

  it('has sources to check', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('contains no Math.random anywhere in src', () => {
    for (const file of files) {
      expect(codeOf(readFileSync(file, 'utf8')), file).not.toMatch(/Math\s*\.\s*random/);
    }
  });

  it('reaches for no clock, no network and no framework', () => {
    for (const file of files) {
      const source = codeOf(readFileSync(file, 'utf8'));
      expect(source, file).not.toMatch(/Date\s*\.\s*now|new Date\(|fetch\(|process\.env/);
      for (const match of source.matchAll(/from '([^']+)'/g)) {
        // Relative, and extension-qualified so Deno can load the same files.
        expect(match[1], `${file} imports ${match[1]}`).toMatch(/^\.\.?\/.*\.ts$/);
      }
    }
  });
});
