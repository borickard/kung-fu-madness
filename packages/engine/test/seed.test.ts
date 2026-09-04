import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOVES } from '../src/balance.ts';

/**
 * The `moves` table is the one place a balance value is copied out of the
 * engine. This test is what keeps the copy honest.
 */
const CATALOG = new URL('../../../supabase/migrations/0005_move_catalog.sql', import.meta.url)
  .pathname;

describe('the moves migration', () => {
  const sql = readFileSync(CATALOG, 'utf8');

  it('lists every move exactly as the balance module has it', () => {
    const rows = [...sql.matchAll(/^\s*\((\d+), '([^']+)',([^)]+)\)/gm)].map((match) => {
      const numbers = (match[3] ?? '').split(',').map((n) => Number(n.trim()));
      const [hit_pct, spd, avg_dmg, range, crit_pct, crit_mult, eng, xp_cost] = numbers;
      return {
        id: Number(match[1]),
        name: match[2],
        hit_pct,
        spd,
        avg_dmg,
        range,
        crit_pct,
        crit_mult,
        eng,
        xp_cost,
      };
    });

    expect(rows).toHaveLength(MOVES.length);
    expect(rows).toEqual(MOVES.map((move) => ({ ...move })));
  });
});
