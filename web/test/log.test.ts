import type { LogEvent } from 'engine';
import { describe, expect, it } from 'vitest';
import { movePast, renderEvent } from '../src/lib/log.ts';

const names = { a: 'Richard', b: 'Bao' };

describe('combat log', () => {
  it('reads like the original: name, move, points of damage', () => {
    const hit: LogEvent = {
      kind: 'hit',
      attacker: 'b',
      move: 'High Punch',
      move_id: 2,
      zone: 'HIGH_LEFT',
      amount: 57,
      crit: false,
      guards: 0,
      hp_after: 43,
    };
    expect(renderEvent(hit, names)).toBe(
      'Richard was High Punched to the high left for 57 points of damage.',
    );
  });

  it('mentions a crit and a block without raising its voice', () => {
    const base = {
      kind: 'hit' as const,
      attacker: 'a' as const,
      move: 'Flying Kick',
      move_id: 8,
      zone: 'MID_RIGHT' as const,
      amount: 12,
      hp_after: 60,
    };
    expect(renderEvent({ ...base, crit: true, guards: 0 }, names)).toContain(', a clean one.');
    expect(renderEvent({ ...base, crit: false, guards: 1 }, names)).toContain(', partly blocked.');
    expect(renderEvent({ ...base, crit: false, guards: 3 }, names)).toContain(', well blocked.');
  });

  it('renders misses, fizzles and the end of a battle', () => {
    expect(
      renderEvent(
        { kind: 'miss', attacker: 'a', move: 'Sweep', move_id: 5, zone: 'LOW_LEFT' },
        names,
      ),
    ).toBe('Richard threw a Sweep at the low left and hit the air.');

    expect(
      renderEvent(
        { kind: 'fizzle', attacker: 'b', move: 'Roundhouse', move_id: 7, zone: 'MID_LEFT' },
        names,
      ),
    ).toBe('Bao had nothing left for the Roundhouse.');

    expect(renderEvent({ kind: 'end', outcome: 'knockout', winner: 'b' }, names)).toBe(
      'Bao wins by knockout.',
    );
    expect(renderEvent({ kind: 'end', outcome: 'draw' }, names)).toBe(
      'The battle is a draw. Nobody is paid.',
    );
  });

  it('knows the past tense of every move in the catalog', () => {
    expect(movePast('Jab')).toBe('Jabbed');
    expect(movePast('Sweep')).toBe('Swept');
    expect(movePast('Roundhouse')).toBe('Roundhoused');
    expect(movePast('Flying Kick')).toBe('Flying Kicked');
  });
});
