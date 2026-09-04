import { MOVES } from 'engine';
import { describe, expect, it } from 'vitest';
import { belt, outcomeLine, percent, record, timeLeft } from '../src/lib/format.ts';
import { PAST_TENSE, movePast } from '../src/lib/log.ts';

describe('format', () => {
  it('turns HP into a bar percentage, clamped', () => {
    expect(percent(50, 100)).toBe(50);
    expect(percent(-20, 100)).toBe(0);
    expect(percent(10, 0)).toBe(0);
  });

  it('counts down to a deadline in the units that matter', () => {
    const now = Date.parse('2003-05-01T12:00:00Z');
    const at = (ms: number) => new Date(now + ms).toISOString();
    expect(timeLeft(at(30 * 60_000), now)).toBe('30m');
    expect(timeLeft(at(3 * 3_600_000 + 15 * 60_000), now)).toBe('3h 15m');
    expect(timeLeft(at(26 * 3_600_000), now)).toBe('1d 2h');
    expect(timeLeft(at(-1), now)).toBe('overdue');
    expect(timeLeft(null, now)).toBe('—');
  });

  it('names belts and records', () => {
    expect(belt(0)).toBe('White');
    expect(belt(8)).toBe('Black');
    expect(record({ wins: 3, losses: 1, draws: 2 })).toBe('3-1-2');
  });

  it('says what happened at the end of a battle', () => {
    expect(outcomeLine('knockout', 'Bao')).toBe('Bao wins by knockout');
    expect(outcomeLine('draw', null)).toBe('A draw, which pays nothing');
    expect(outcomeLine(null, null)).toBe('In progress');
  });

  it('has a past tense written down for every move in the catalog', () => {
    for (const move of MOVES) {
      expect(Object.keys(PAST_TENSE), move.name).toContain(move.name);
      expect(movePast(move.name)).not.toBe(move.name);
    }
  });
});
