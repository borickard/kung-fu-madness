import { describe, expect, it } from 'vitest';
import { HIT_CHANCE_MAX, HIT_CHANCE_MIN } from '../src/balance.ts';
import { resolveRound } from '../src/resolve.ts';
import type { FighterState, LogEvent } from '../src/types.ts';
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

const kindsOf = (events: LogEvent[]) => events.map((e) => e.kind);
const hitOf = (events: LogEvent[]) => {
  const hit = events.find((e) => e.kind === 'hit');
  if (!hit || hit.kind !== 'hit') throw new Error('expected a hit event');
  return hit;
};

/** One unblocked Flying Kick, with the rolls fully written down. */
function kick(
  attacker: Partial<FighterState>,
  defender: Partial<FighterState>,
  rolls: { hit: number; spread?: number; crit?: number },
) {
  return resolveRound({
    state: state(attacker, defender),
    a: submission([attack(FLYING_KICK, 'MID')]),
    b: NOTHING,
    rng: scriptRng({
      floats: [0.1, ...(rolls.spread === undefined ? [] : [rolls.spread])],
      ints: [rolls.hit, ...(rolls.crit === undefined ? [] : [rolls.crit])],
    }),
  });
}

describe('hit chance', () => {
  it('clamps to the floor at an extreme evasion spread', () => {
    // 48 + (0 - 100) * 1.5 = -102, floored at 15.
    const lands = kick({ accuracy: 0 }, { evasion: 100 }, { hit: HIT_CHANCE_MIN, spread: FLAT_SPREAD, crit: ROLL_MAX });
    expect(kindsOf(lands.events)).toEqual(['hit']);

    const misses = kick({ accuracy: 0 }, { evasion: 100 }, { hit: HIT_CHANCE_MIN + 1 });
    expect(kindsOf(misses.events)).toEqual(['miss']);
  });

  it('clamps to the ceiling at an extreme accuracy spread', () => {
    // 48 + (100 - 0) * 1.5 = 198, capped at 97.
    const lands = kick({ accuracy: 100 }, { evasion: 0 }, { hit: HIT_CHANCE_MAX, spread: FLAT_SPREAD, crit: ROLL_MAX });
    expect(kindsOf(lands.events)).toEqual(['hit']);

    const misses = kick({ accuracy: 100 }, { evasion: 0 }, { hit: HIT_CHANCE_MAX + 1 });
    expect(kindsOf(misses.events)).toEqual(['miss']);
  });
});

describe('damage', () => {
  it('scales with attacker strength', () => {
    const weak = kick({ strength: 0 }, {}, { hit: ROLL_MIN, spread: FLAT_SPREAD, crit: ROLL_MAX });
    const strong = kick({ strength: 25 }, {}, { hit: ROLL_MIN, spread: FLAT_SPREAD, crit: ROLL_MAX });
    expect(hitOf(weak.events).amount).toBe(38); // 38 * 1.00
    expect(hitOf(strong.events).amount).toBe(76); // 38 * 2.00
  });

  it('shrinks with defender toughness', () => {
    const soft = kick({ strength: 25 }, { toughness: 0 }, { hit: ROLL_MIN, spread: FLAT_SPREAD, crit: ROLL_MAX });
    const tough = kick({ strength: 25 }, { toughness: 10 }, { hit: ROLL_MIN, spread: FLAT_SPREAD, crit: ROLL_MAX });
    expect(hitOf(soft.events).amount).toBe(76);
    expect(hitOf(tough.events).amount).toBe(53); // 76 * 0.70 = 53.2
  });

  it('applies crit_mult before mitigation and toughness', () => {
    const crit = kick({ strength: 25 }, { toughness: 10 }, { hit: ROLL_MIN, spread: FLAT_SPREAD, crit: ROLL_MIN });
    // 76 * 2.5 = 190, then * 0.70 = 133. Toughness first would give 53 * 2.5 = 133 too,
    // so the discriminating case is the rounding one below.
    expect(hitOf(crit.events)).toMatchObject({ crit: true, amount: 133 });
  });

  it('rounds damage exactly once, at the end', () => {
    // spread 0.09 -> 38 * 0.795 = 30.21, crit -> 75.525, rounded once -> 76.
    // Rounding the pre-crit figure first would give 30 * 2.5 = 75.
    const result = kick({ strength: 0 }, {}, { hit: ROLL_MIN, spread: 0.09, crit: ROLL_MIN });
    expect(hitOf(result.events).amount).toBe(76);
  });

  it('reports the damage dealt per side', () => {
    const result = kick({ strength: 25 }, {}, { hit: ROLL_MIN, spread: FLAT_SPREAD, crit: ROLL_MAX });
    expect(result.damage).toEqual({ a: 76, b: 0 });
    expect(result.state.b.hp).toBe(1000 - 76);
  });
});
