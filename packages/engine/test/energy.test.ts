import { describe, expect, it } from 'vitest';
import { ENERGY_REGEN } from '../src/balance.ts';
import { resolveRound } from '../src/resolve.ts';
import {
  FLAT_SPREAD,
  FLYING_KICK,
  NOTHING,
  ROLL_MAX,
  ROLL_MIN,
  attack,
  scriptRng,
  state,
  submission,
} from './helpers.ts';

const KICK_COST = FLYING_KICK.eng; // 12

describe('energy', () => {
  it('deducts on a hit', () => {
    const result = resolveRound({
      state: state({ energy: 20 }, {}),
      a: submission([attack(FLYING_KICK, 'MID')]),
      b: NOTHING,
      rng: scriptRng({ floats: [0.1, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
    });
    expect(result.events[0]?.kind).toBe('hit');
    expect(result.state.a.energy).toBe(20 + ENERGY_REGEN - KICK_COST);
  });

  it('deducts on a miss', () => {
    const result = resolveRound({
      state: state({ energy: 20 }, {}),
      a: submission([attack(FLYING_KICK, 'MID')]),
      b: NOTHING,
      rng: scriptRng({ floats: [0.1], ints: [ROLL_MAX] }),
    });
    expect(result.events[0]?.kind).toBe('miss');
    expect(result.state.a.energy).toBe(20 + ENERGY_REGEN - KICK_COST);
  });

  it('deducts against a block just the same', () => {
    const result = resolveRound({
      state: state({ energy: 20 }, {}),
      a: submission([attack(FLYING_KICK, 'MID')]),
      b: submission([], ['MID', 'MID', 'MID']),
      rng: scriptRng({ floats: [0.1], ints: [] }),
    });
    expect(result.events[0]).toMatchObject({ kind: 'block', zone: 'MID' });
    expect(result.state.a.energy).toBe(20 + ENERGY_REGEN - KICK_COST);
  });

  it('fizzles without enough energy, and deducts nothing', () => {
    const result = resolveRound({
      state: state({ energy: 5 }, {}),
      a: submission([attack(FLYING_KICK, 'MID')]),
      b: NOTHING,
      // One tie key, and no rolls at all: a fizzle never reaches the dice.
      rng: scriptRng({ floats: [0.1], ints: [] }),
    });
    expect(result.events[0]).toMatchObject({ kind: 'fizzle', move: 'Flying Kick' });
    expect(result.state.a.energy).toBe(5 + ENERGY_REGEN);
  });

  it('regenerates 5 a round, capped at energy_max', () => {
    const result = resolveRound({
      state: state({ energy: 4, energy_max: 20 }, { energy: 18, energy_max: 20 }),
      a: NOTHING,
      b: NOTHING,
      rng: scriptRng({}),
    });
    expect(result.state.a.energy).toBe(9);
    expect(result.state.b.energy).toBe(20);
  });
});
