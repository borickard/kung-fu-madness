import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_CAP,
  BELTS,
  REPEAT_OPPONENT_DECAY,
  STARTING_MOVE_IDS,
  WIN_XP_BASE,
} from '../src/balance.ts';
import {
  attributeCost,
  battleXp,
  beltForXp,
  beltName,
  buyAttribute,
  buyMove,
  cumulativeAttributeCost,
  repeatOpponentDecay,
  xpBalance,
  xpToNextBelt,
} from '../src/progression.ts';

const FRESH = { strength: 1, accuracy: 1, evasion: 1, toughness: 1 };

describe('attribute cost', () => {
  it('follows 40 * level^2 for the step to that level', () => {
    expect(attributeCost(2)).toBe(160);
    expect(attributeCost(3)).toBe(360);
    expect(attributeCost(10)).toBe(4000);
    expect(attributeCost(ATTRIBUTE_CAP)).toBe(25000);
  });

  it('sums the steps a fighter has already paid for', () => {
    expect(cumulativeAttributeCost(1)).toBe(0);
    expect(cumulativeAttributeCost(3)).toBe(160 + 360);
  });

  it('refuses a purchase beyond the XP balance', () => {
    expect(buyAttribute(1, 159)).toEqual({ ok: false, reason: 'insufficient_xp', cost: 160 });
    expect(buyAttribute(1, 160)).toEqual({ ok: true, cost: 160, level: 2 });
  });

  it('refuses a purchase above the cap, however much XP is on the table', () => {
    expect(buyAttribute(ATTRIBUTE_CAP, 10_000_000)).toMatchObject({ ok: false, reason: 'at_cap' });
    expect(buyAttribute(ATTRIBUTE_CAP - 1, 10_000_000)).toMatchObject({ ok: true });
  });
});

describe('xp balance', () => {
  it('is cumulative XP minus everything already bought', () => {
    expect(xpBalance(1000, FRESH, STARTING_MOVE_IDS)).toBe(1000);
    expect(xpBalance(1000, { ...FRESH, strength: 3 }, STARTING_MOVE_IDS)).toBe(1000 - 520);
    // Front Kick costs 120.
    expect(xpBalance(1000, FRESH, [...STARTING_MOVE_IDS, 4])).toBe(880);
  });

  it('refuses a move already owned, unknown, or out of reach', () => {
    expect(buyMove(4, 120, [...STARTING_MOVE_IDS])).toEqual({ ok: true, cost: 120, level: 0 });
    expect(buyMove(4, 119, [...STARTING_MOVE_IDS])).toMatchObject({ reason: 'insufficient_xp' });
    expect(buyMove(1, 10_000, [...STARTING_MOVE_IDS])).toMatchObject({ reason: 'already_owned' });
    expect(buyMove(99, 10_000, [...STARTING_MOVE_IDS])).toMatchObject({ reason: 'unknown_move' });
  });
});

describe('belts', () => {
  it('derives the belt at each exact threshold', () => {
    BELTS.forEach((belt, index) => {
      expect(beltForXp(belt.xp), belt.name).toBe(index);
      if (belt.xp > 0) expect(beltForXp(belt.xp - 1), belt.name).toBe(index - 1);
    });
  });

  it('names the ladder from white to the tenth dan', () => {
    expect(beltName(0)).toBe('White');
    expect(beltName(8)).toBe('Black');
    expect(beltName(9)).toBe('1st Dan');
    expect(beltName(18)).toBe('10th Dan');
    expect(beltForXp(22000 + 8000 * 10)).toBe(18);
  });

  it('reports the gap to the next belt, and nothing at the top', () => {
    expect(xpToNextBelt(0)).toEqual({ belt: 1, needed: 300 });
    expect(xpToNextBelt(22000 + 8000 * 10)).toBeNull();
  });
});

describe('battle xp', () => {
  const damage = { a: 140, b: 90 };

  it('pays damage to both fighters and a bonus to the winner', () => {
    expect(battleXp({ outcome: 'knockout', winner: 'a', damage, belt: { a: 2, b: 2 } })).toEqual({
      a: 140 + WIN_XP_BASE,
      b: 90,
    });
  });

  it('raises the bonus for beating a higher belt, and never lowers it', () => {
    // Winner is white, loser is brown: six steps up.
    expect(battleXp({ outcome: 'knockout', winner: 'a', damage, belt: { a: 0, b: 6 } })).toEqual({
      a: 140 + 60 * (1 + 0.25 * 6),
      b: 90,
    });
    // Beating someone far below pays the base bonus, not less.
    expect(battleXp({ outcome: 'knockout', winner: 'a', damage, belt: { a: 6, b: 0 } })).toEqual({
      a: 140 + WIN_XP_BASE,
      b: 90,
    });
  });

  it('pays nothing at all for a draw', () => {
    expect(battleXp({ outcome: 'draw', damage, belt: { a: 0, b: 6 } })).toEqual({ a: 0, b: 0 });
  });

  it('decays 1, 0.5, 0.25, 0 across four battles against the same opponent', () => {
    const paid = [0, 1, 2, 3].map(
      (prior) =>
        battleXp({
          outcome: 'knockout',
          winner: 'a',
          damage: { a: 100, b: 40 },
          belt: { a: 1, b: 1 },
          priorBattlesInWindow: prior,
        }).a,
    );
    expect(paid).toEqual([160, 80, 40, 0]);
    expect([0, 1, 2, 3].map(repeatOpponentDecay)).toEqual([...REPEAT_OPPONENT_DECAY]);
    expect(repeatOpponentDecay(9)).toBe(0);
  });

  it('treats a walkover like any other win', () => {
    expect(
      battleXp({ outcome: 'walkover', winner: 'b', damage: { a: 0, b: 0 }, belt: { a: 0, b: 0 } }),
    ).toEqual({ a: 0, b: WIN_XP_BASE });
  });
});
