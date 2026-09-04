import type { LogEvent } from 'engine';
import { describe, expect, it } from 'vitest';
import { movePast, renderEvent } from '../src/lib/log.ts';

const names = { a: 'Richard', b: 'Bao' };

describe('combat log', () => {
  it('reads like the original: name, move, points of damage', () => {
    const hit: LogEvent = {
      kind: 'hit',
      attacker: 'b',
      move: 'Punch',
      move_id: 2,
      zone: 'HIGH',
      exchange: 1,
      amount: 57,
      crit: false,
      hp_after: 43,
    };
    expect(renderEvent(hit, names)).toBe(
      'Richard was Punched to the high for 57 points of damage.',
    );
  });

  it('notes a clean hit without raising its voice', () => {
    const base = {
      kind: 'hit' as const,
      attacker: 'a' as const,
      move: 'Flying Kick',
      move_id: 8,
      zone: 'MID' as const,
      exchange: 2,
      amount: 12,
      hp_after: 60,
    };
    expect(renderEvent({ ...base, crit: true }, names)).toContain(', a clean one.');
    expect(renderEvent({ ...base, crit: false }, names)).toBe(
      'Bao was Flying Kicked to the mid for 12 points of damage.',
    );
  });

  it('says who read whom when a block lands', () => {
    expect(
      renderEvent(
        { kind: 'block', attacker: 'a', move: 'Kick', move_id: 3, zone: 'LOW', exchange: 3 },
        names,
      ),
    ).toBe('Bao read the Kick and blocked low.');
  });

  it('renders misses, fizzles and the end of a battle', () => {
    expect(
      renderEvent(
        { kind: 'miss', attacker: 'a', move: 'Sweep', move_id: 5, zone: 'LOW', exchange: 1 },
        names,
      ),
    ).toBe('Richard threw a Sweep at the low and hit the air.');

    expect(
      renderEvent(
        { kind: 'fizzle', attacker: 'b', move: 'Roundhouse', move_id: 7, zone: 'MID', exchange: 3 },
        names,
      ),
    ).toBe('Bao had nothing left for the Roundhouse.');

    expect(renderEvent({ kind: 'end', outcome: 'knockout', winner: 'b' }, names)).toBe(
      'Bao wins by knockout.',
    );
  });

  it('survives a zone from an older six-zone log', () => {
    const stale = {
      kind: 'miss',
      attacker: 'a',
      move: 'Jab',
      move_id: 1,
      zone: 'MID_LEFT',
      exchange: 1,
    } as unknown as LogEvent;
    expect(() => renderEvent(stale, names)).not.toThrow();
    expect(renderEvent(stale, names)).toContain('mid left');
  });

  it('knows the past tense of every move in the catalog', () => {
    expect(movePast('Jab')).toBe('Jabbed');
    expect(movePast('Punch')).toBe('Punched');
    expect(movePast('Kick')).toBe('Kicked');
    expect(movePast('Sweep')).toBe('Swept');
  });
});
