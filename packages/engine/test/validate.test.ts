import { describe, expect, it } from 'vitest';
import { STARTING_MOVE_IDS } from '../src/balance.ts';
import { validateSubmission } from '../src/resolve.ts';
import type { Submission } from '../src/types.ts';
import { FLYING_KICK, JAB, attack, submission } from './helpers.ts';

const LEGAL: Submission = submission(
  [attack(JAB, 'HIGH'), attack(JAB, 'HIGH'), attack(JAB, 'LOW')],
  ['MID', 'MID', 'MID'],
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
    const bent = { ...LEGAL, blocks: ['MID', 'ELSEWHERE', 'MID'] } as unknown as Submission;
    expect(validateSubmission(bent)).toEqual(['invalid block zone ELSEWHERE']);
  });

  it('rejects a move the fighter does not own', () => {
    const unowned = submission(
      [attack(FLYING_KICK, 'MID'), attack(JAB, 'MID'), attack(JAB, 'MID')],
      ['MID', 'MID', 'MID'],
    );
    expect(validateSubmission(unowned, STARTING_MOVE_IDS)).toEqual(['move 8 is not owned']);
    expect(validateSubmission(unowned)).toEqual([]);
  });
});
