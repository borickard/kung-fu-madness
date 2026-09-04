import { describe, expect, it } from 'vitest';
import { DECISION_MARGIN, ROUND_CAP } from '../src/balance.ts';
import { battleXp } from '../src/progression.ts';
import { resolveRound } from '../src/resolve.ts';
import {
  FLAT_SPREAD,
  FLYING_KICK,
  JAB,
  NOTHING,
  ROLL_MAX,
  ROLL_MIN,
  attack,
  scriptRng,
  state,
  submission,
} from './helpers.ts';

describe('outcomes', () => {
  it('is a draw when both fighters end at or below 0, and pays nothing', () => {
    // Combat alone cannot get here: whoever goes down first loses the rest of
    // their round, so the fighter still standing stays standing. The rule is
    // the safety net for a state that arrives already doubled over.
    const result = resolveRound({
      state: state({ hp: 0 }, { hp: -3 }),
      a: NOTHING,
      b: NOTHING,
      rng: scriptRng({}),
    });

    expect(result.outcome).toBe('draw');
    expect(result.winner).toBeUndefined();
    expect(result.events.at(-1)).toEqual({ kind: 'end', outcome: 'draw' });
    expect(battleXp({ outcome: 'draw', damage: result.damage, belt: { a: 0, b: 8 } })).toEqual({
      a: 0,
      b: 0,
    });
  });

  it('drops the rest of the round for the fighter who goes down first', () => {
    const both = submission([attack(JAB, 'MID_LEFT')]);
    const result = resolveRound({
      state: state({ hp: 1 }, { hp: 1 }),
      a: both,
      b: both,
      // A's tie key is lower, so A swings first and B never answers.
      rng: scriptRng({ floats: [0.1, 0.2, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
    });

    expect(result.outcome).toBe('knockout');
    expect(result.winner).toBe('a');
    expect(result.events.filter((e) => e.kind !== 'end')).toHaveLength(1);
  });

  it('is a knockout to the fighter left standing', () => {
    const result = resolveRound({
      state: state({}, { hp: 5 }),
      a: submission([attack(FLYING_KICK, 'MID_LEFT')]),
      b: NOTHING,
      rng: scriptRng({ floats: [0.1, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
    });

    expect(result.outcome).toBe('knockout');
    expect(result.winner).toBe('a');
    expect(result.events.at(-1)).toEqual({ kind: 'end', outcome: 'knockout', winner: 'a' });
  });

  it('goes to a decision on the higher remaining HP percentage at the round cap', () => {
    // B has more HP in absolute terms and still loses: 50% beats 30%.
    const result = resolveRound({
      state: state({ hp: 50, hp_max: 100 }, { hp: 60, hp_max: 200 }, ROUND_CAP),
      a: NOTHING,
      b: NOTHING,
      rng: scriptRng({}),
    });

    expect(result.outcome).toBe('decision');
    expect(result.winner).toBe('a');
  });

  it('calls a decision inside the margin a draw', () => {
    // 50.0% against 49.5%, half a point apart.
    const result = resolveRound({
      state: state({ hp: 50, hp_max: 100 }, { hp: 99, hp_max: 200 }, ROUND_CAP),
      a: NOTHING,
      b: NOTHING,
      rng: scriptRng({}),
    });

    expect(result.outcome).toBe('draw');
    expect(result.winner).toBeUndefined();
    expect(Math.abs(50 - 49.5)).toBeLessThanOrEqual(DECISION_MARGIN);
  });

  it('continues, and advances the round, below the cap', () => {
    const result = resolveRound({
      state: state({}, {}, ROUND_CAP - 1),
      a: NOTHING,
      b: NOTHING,
      rng: scriptRng({}),
    });

    expect(result.outcome).toBe('continue');
    expect(result.state.round_no).toBe(ROUND_CAP);
    expect(result.events).toEqual([]);
  });

  it('keeps the round number where it was once the battle is over', () => {
    const result = resolveRound({
      state: state({ hp: 50, hp_max: 100 }, { hp: 10, hp_max: 100 }, ROUND_CAP),
      a: NOTHING,
      b: NOTHING,
      rng: scriptRng({}),
    });
    expect(result.state.round_no).toBe(ROUND_CAP);
  });
});
