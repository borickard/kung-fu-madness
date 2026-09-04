import { describe, expect, it } from 'vitest';
import { MITIGATION_DOUBLE, MITIGATION_SINGLE } from '../src/balance.ts';
import { resolveRound } from '../src/resolve.ts';
import type { LogEvent, Move, Zone } from '../src/types.ts';
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

const hitOf = (events: LogEvent[]) => {
  const hit = events.find((e) => e.kind === 'hit');
  if (!hit || hit.kind !== 'hit') throw new Error('expected a hit event');
  return hit;
};

/**
 * One Flying Kick from A at MID_LEFT, against `blocks`. Strength 25 doubles
 * the base damage to 76, which is large enough that the mitigation figures
 * are pinned exactly rather than lost in rounding.
 */
function kickInto(blocks: Zone[], crits: boolean) {
  return resolveRound({
    state: state({ strength: 25 }, {}),
    a: submission([attack(FLYING_KICK, 'MID_LEFT')]),
    b: submission([], blocks),
    rng: scriptRng({
      floats: [0.1, FLAT_SPREAD],
      // hit roll, then the crit roll — only drawn when the zone is unblocked
      ints: blocks.includes('MID_LEFT')
        ? [ROLL_MIN]
        : [ROLL_MIN, crits ? ROLL_MIN : ROLL_MAX],
    }),
  });
}

const UNBLOCKED_BASE = 76;

describe('blocking', () => {
  it('applies no mitigation when the zone is not blocked', () => {
    expect(hitOf(kickInto(['HIGH_LEFT', 'LOW_RIGHT', 'MID_RIGHT'], false).events)).toMatchObject({
      amount: UNBLOCKED_BASE,
      guards: 0,
    });
  });

  it('applies exactly 0.80 for one guard', () => {
    const hit = hitOf(kickInto(['MID_LEFT', 'HIGH_LEFT', 'LOW_RIGHT'], false).events);
    expect(hit.guards).toBe(1);
    expect(hit.amount).toBe(15); // 76 * 0.20 = 15.2
    expect(hit.amount).toBe(Math.round(UNBLOCKED_BASE * (1 - MITIGATION_SINGLE)));
  });

  it('applies exactly 0.92 for two guards and for three', () => {
    const two = hitOf(kickInto(['MID_LEFT', 'MID_LEFT', 'LOW_RIGHT'], false).events);
    const three = hitOf(kickInto(['MID_LEFT', 'MID_LEFT', 'MID_LEFT'], false).events);
    expect(two.guards).toBe(2);
    expect(three.guards).toBe(3);
    expect(two.amount).toBe(6); // 76 * 0.08 = 6.08
    expect(three.amount).toBe(6);
    expect(two.amount).toBe(Math.round(UNBLOCKED_BASE * (1 - MITIGATION_DOUBLE)));
  });

  it('never crits a blocked zone, even at crit_pct 100', () => {
    const alwaysCrits: Move = { ...FLYING_KICK, crit_pct: 100 };
    const catalog = new Map([[alwaysCrits.id, alwaysCrits]]);

    const blocked = resolveRound({
      state: state({ strength: 25 }, {}),
      a: submission([attack(alwaysCrits, 'MID_LEFT')]),
      b: submission([], ['MID_LEFT', 'HIGH_LEFT', 'LOW_RIGHT']),
      // No crit roll is drawn at all: the list holds exactly one int.
      rng: scriptRng({ floats: [0.1, FLAT_SPREAD], ints: [ROLL_MIN] }),
      moves: catalog,
    });
    expect(hitOf(blocked.events)).toMatchObject({ crit: false, amount: 15 });

    const open = resolveRound({
      state: state({ strength: 25 }, {}),
      a: submission([attack(alwaysCrits, 'MID_LEFT')]),
      b: NOTHING,
      rng: scriptRng({ floats: [0.1, FLAT_SPREAD], ints: [ROLL_MIN, ROLL_MAX] }),
      moves: catalog,
    });
    // crit_pct 100 means even the worst possible roll crits.
    expect(hitOf(open.events)).toMatchObject({ crit: true, amount: 190 });
  });
});
