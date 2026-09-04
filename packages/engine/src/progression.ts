import {
  ATTRIBUTE_CAP,
  ATTRIBUTE_COST_FACTOR,
  ATTRIBUTE_KEYS,
  BELTS,
  MOVES_BY_ID,
  REPEAT_OPPONENT_DECAY,
  STARTING_FIGHTER,
  WIN_XP_BASE,
  WIN_XP_PER_BELT_STEP,
  type AttributeKey,
} from './balance.ts';
import type { Outcome, Side } from './types.ts';

/** XP for the step *to* `level`. Level 1 is free, it is where a fighter starts. */
export function attributeCost(level: number): number {
  return ATTRIBUTE_COST_FACTOR * level * level;
}

/** XP a fighter has already sunk into getting one attribute to `level`. */
export function cumulativeAttributeCost(level: number): number {
  let total = 0;
  for (let l = STARTING_FIGHTER.strength + 1; l <= level; l += 1) total += attributeCost(l);
  return total;
}

export type AttributeBlock = Record<AttributeKey, number>;

/**
 * `fighters.xp` is cumulative XP earned and never goes down; what is left to
 * spend is that minus everything already bought.
 */
export function spentXp(attributes: AttributeBlock, ownedMoveIds: readonly number[]): number {
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) total += cumulativeAttributeCost(attributes[key]);
  for (const id of ownedMoveIds) total += MOVES_BY_ID.get(id)?.xp_cost ?? 0;
  return total;
}

export function xpBalance(
  xp: number,
  attributes: AttributeBlock,
  ownedMoveIds: readonly number[],
): number {
  return xp - spentXp(attributes, ownedMoveIds);
}

export type PurchaseRefusal = 'at_cap' | 'insufficient_xp' | 'already_owned' | 'unknown_move';

export type Purchase =
  | { ok: true; cost: number; level: number }
  | { ok: false; reason: PurchaseRefusal; cost: number };

export function buyAttribute(currentLevel: number, balance: number): Purchase {
  const level = currentLevel + 1;
  const cost = attributeCost(level);
  if (currentLevel >= ATTRIBUTE_CAP) return { ok: false, reason: 'at_cap', cost };
  if (balance < cost) return { ok: false, reason: 'insufficient_xp', cost };
  return { ok: true, cost, level };
}

export function buyMove(
  move_id: number,
  balance: number,
  ownedMoveIds: readonly number[],
): Purchase {
  const move = MOVES_BY_ID.get(move_id);
  if (!move) return { ok: false, reason: 'unknown_move', cost: 0 };
  if (ownedMoveIds.includes(move_id))
    return { ok: false, reason: 'already_owned', cost: move.xp_cost };
  if (balance < move.xp_cost)
    return { ok: false, reason: 'insufficient_xp', cost: move.xp_cost };
  return { ok: true, cost: move.xp_cost, level: 0 };
}

/** Belt index for a cumulative XP total. */
export function beltForXp(xp: number): number {
  let belt = 0;
  for (let i = 0; i < BELTS.length; i += 1) {
    if (xp >= (BELTS[i] as { xp: number }).xp) belt = i;
    else break;
  }
  return belt;
}

export function beltName(belt: number): string {
  return BELTS[Math.max(0, Math.min(BELTS.length - 1, belt))]?.name ?? 'White';
}

/** XP still needed for the next belt, or null at the top of the ladder. */
export function xpToNextBelt(xp: number): { belt: number; needed: number } | null {
  const next = beltForXp(xp) + 1;
  const threshold = BELTS[next];
  if (!threshold) return null;
  return { belt: next, needed: threshold.xp - xp };
}

/** 1.0, 0.5, 0.25, then 0 for repeated battles against the same opponent. */
export function repeatOpponentDecay(priorBattlesInWindow: number): number {
  return REPEAT_OPPONENT_DECAY[priorBattlesInWindow] ?? 0;
}

/**
 * XP paid out at the end of a battle. A draw pays nothing at all, to either
 * fighter — that is how the original behaved. Nothing is ever deducted.
 */
export function battleXp(input: {
  outcome: Outcome | 'walkover';
  winner?: Side;
  damage: { a: number; b: number };
  belt: { a: number; b: number };
  priorBattlesInWindow?: number;
}): { a: number; b: number } {
  const { winner } = input;
  if (!winner) return { a: 0, b: 0 };

  const loser: Side = winner === 'a' ? 'b' : 'a';
  const beltDifference = Math.max(0, input.belt[loser] - input.belt[winner]);
  const decay = repeatOpponentDecay(input.priorBattlesInWindow ?? 0);

  const award = { a: input.damage.a, b: input.damage.b };
  award[winner] += WIN_XP_BASE * (1 + WIN_XP_PER_BELT_STEP * beltDifference);

  return {
    a: Math.round(award.a * decay),
    b: Math.round(award.b * decay),
  };
}
