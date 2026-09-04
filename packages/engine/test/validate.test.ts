import { describe, expect, it } from 'vitest';
import { STARTING_MOVE_IDS } from '../src/balance.ts';
import { validateSubmission } from '../src/resolve.ts';
import type { Submission } from '../src/types.ts';
import { FLYING_KICK, JAB, attack, submission } from './helpers.ts';

const LEGAL: Submission = submission(
  [attack(JAB, 'HIGH_LEFT'), attack(JAB, 'HIGH_LEFT'), attack(JAB, 'LOW_RIGHT')],
  ['MID_LEFT', 'MID_LEFT', 'MID_LEFT'],
);

describe('validateSubmission', () => {
  it('accepts three attacks and three blocks, repeats included', () => {
    expect(validateSubmission(LEGAL, STARTING_MOVE_IDS)).toEqual([]);
  });

  it('rejects the wrong number of slots', () => {
    expect(validateSubmission({ ...LEGAL, attacks: LEGAL.attacks.slice(1) })).toHaveLength(1);
    expect(validateSubmission({ ...LEGAL, blocks: [] })).toHaveLength(1);
  });

  it('rejects a zone that is not one of the six', () => {
    const bent = { ...LEGAL, blocks: ['MID_LEFT', 'ELSEWHERE', 'MID_LEFT'] } as unknown as Submission;
    expect(validateSubmission(bent)).toEqual(['invalid block zone ELSEWHERE']);
  });

  it('rejects a move the fighter does not own', () => {
    const unowned = submission(
      [attack(FLYING_KICK, 'MID_LEFT'), attack(JAB, 'MID_LEFT'), attack(JAB, 'MID_LEFT')],
      ['MID_LEFT', 'MID_LEFT', 'MID_LEFT'],
    );
    expect(validateSubmission(unowned, STARTING_MOVE_IDS)).toEqual(['move 8 is not owned']);
    expect(validateSubmission(unowned)).toEqual([]);
  });
});
