import { describe, expect, it } from 'vitest';
import {
  ATTACKS_PER_ROUND,
  BLOCKS_PER_ROUND,
  ENERGY_REGEN,
  MOVES,
  STARTING_MOVE_IDS,
} from '../src/balance.ts';
import { botSubmission, zonesAttackedBy } from '../src/bot.ts';
import { validateSubmission } from '../src/resolve.ts';
import type { Zone } from '../src/types.ts';
import { FLYING_KICK, JAB, fighter } from './helpers.ts';

const ALL_MOVE_IDS = MOVES.map((move) => move.id);

function round(seed = 4242, round_no = 1, overrides: Partial<Parameters<typeof botSubmission>[0]> = {}) {
  return botSubmission({
    seed,
    round_no,
    self: fighter({ energy: 20, energy_max: 20 }),
    moveIds: STARTING_MOVE_IDS,
    ...overrides,
  });
}

describe('the bot', () => {
  it('always submits a legal round', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const submission = round(seed);
      expect(validateSubmission(submission, STARTING_MOVE_IDS)).toEqual([]);
      expect(submission.attacks).toHaveLength(ATTACKS_PER_ROUND);
      expect(submission.blocks).toHaveLength(BLOCKS_PER_ROUND);
    }
  });

  it('only throws moves it owns', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const attack of round(seed, 1, { moveIds: [JAB.id] }).attacks) {
        expect(attack.move_id).toBe(JAB.id);
      }
    }
  });

  it('repeats a round exactly, and differs between rounds and seeds', () => {
    expect(JSON.stringify(round(7, 3))).toBe(JSON.stringify(round(7, 3)));
    expect(JSON.stringify(round(7, 4))).not.toBe(JSON.stringify(round(7, 3)));
    expect(JSON.stringify(round(8, 3))).not.toBe(JSON.stringify(round(7, 3)));
  });

  it('does not draw from the stream the round resolution will use', () => {
    // Same seed and round: the bot's dice must not shadow the resolver's.
    const bot = round(11, 2);
    const other = botSubmission({
      seed: 11,
      round_no: 2,
      self: fighter(),
      moveIds: STARTING_MOVE_IDS,
    });
    expect(JSON.stringify(bot.blocks)).toBe(JSON.stringify(other.blocks));
  });

  it('spends within the energy it will have, when it can', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const available = Math.min(20, 8 + ENERGY_REGEN);
      const submission = round(seed, 1, {
        self: fighter({ energy: 8, energy_max: 20 }),
        moveIds: ALL_MOVE_IDS,
      });
      const spent = submission.attacks.reduce((total, attack) => {
        const move = MOVES.find((m) => m.id === attack.move_id);
        return total + (move?.eng ?? 0);
      }, 0);
      // It may overrun by the last swing it could not afford to skip, never by more.
      expect(spent).toBeLessThanOrEqual(available + FLYING_KICK.eng);
    }
  });

  it('throws its cheapest move when it cannot afford anything', () => {
    const submission = round(3, 1, {
      self: fighter({ energy: 0, energy_max: 0 }),
      moveIds: [FLYING_KICK.id, JAB.id],
    });
    expect(submission.attacks.every((attack) => attack.move_id === JAB.id)).toBe(true);
  });

  it('guards where it has been hit before', () => {
    const seen: Zone[] = Array.from({ length: 9 }, () => 'LOW' as Zone);
    let guarded = 0;
    let blind = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      guarded += round(seed, 1, { seen }).blocks.filter((zone) => zone === 'LOW').length;
      blind += round(seed, 1).blocks.filter((zone) => zone === 'LOW').length;
    }
    // Reading the pattern should beat guessing one zone in six by a distance.
    expect(guarded).toBeGreaterThan(blind * 2);
  });

  it('reads the zones a side attacked out of resolved rounds', () => {
    const rounds = [
      {
        events: [
          { kind: 'hit', attacker: 'a', zone: 'HIGH' as Zone },
          { kind: 'miss', attacker: 'b', zone: 'LOW' as Zone },
          { kind: 'fizzle', attacker: 'a', zone: 'MID' as Zone },
          { kind: 'end' },
        ],
      },
    ];
    expect(zonesAttackedBy('a', rounds)).toEqual(['HIGH', 'MID']);
    expect(zonesAttackedBy('b', rounds)).toEqual(['LOW']);
  });

  it('refuses to fight with no moves at all', () => {
    expect(() => round(1, 1, { moveIds: [] })).toThrow(/needs at least one move/);
  });
});
