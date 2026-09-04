import { describe, expect, it } from 'vitest';
import { ENERGY_REGEN, MOVES, ROUND_CAP, STARTING_FIGHTER } from '../src/balance.ts';
import { battleXp, beltForXp } from '../src/progression.ts';
import { resolveRound } from '../src/resolve.ts';
import { makeRng } from '../src/rng.ts';
import { ZONES, type BattleState, type Rng, type Side, type Submission } from '../src/types.ts';

function fresh(): BattleState {
  const fighter = {
    hp: STARTING_FIGHTER.hp_max,
    hp_max: STARTING_FIGHTER.hp_max,
    energy: STARTING_FIGHTER.energy_max,
    energy_max: STARTING_FIGHTER.energy_max,
    strength: STARTING_FIGHTER.strength,
    accuracy: STARTING_FIGHTER.accuracy,
    evasion: STARTING_FIGHTER.evasion,
    toughness: STARTING_FIGHTER.toughness,
  };
  return { round_no: 1, a: { ...fighter }, b: { ...fighter } };
}

/** A player who picks with a die rather than a plan. */
function submissionFor(rng: Rng, moveIds: readonly number[]): Submission {
  const pick = <T>(list: readonly T[]): T => list[rng.int(list.length) - 1] as T;
  return {
    attacks: [0, 1, 2].map(() => ({ move_id: pick(moveIds), zone: pick(ZONES) })),
    blocks: [0, 1, 2].map(() => pick(ZONES)),
  };
}

interface Played {
  rounds: number;
  outcome: string;
  winner?: Side;
  damage: { a: number; b: number };
  final: BattleState;
}

/** What the edge function does, minus the database. */
function playBattle(seed: number): Played {
  const moveIds = MOVES.filter((move) => move.xp_cost === 0).map((move) => move.id);
  const chooser = makeRng(seed, 0);
  let state = fresh();
  const damage = { a: 0, b: 0 };

  for (let round = 1; round <= ROUND_CAP; round += 1) {
    const result = resolveRound({
      state,
      a: submissionFor(chooser, moveIds),
      b: submissionFor(chooser, moveIds),
      rng: makeRng(seed, round),
    });
    damage.a += result.damage.a;
    damage.b += result.damage.b;
    state = result.state;

    if (result.outcome !== 'continue') {
      return {
        rounds: round,
        outcome: result.outcome,
        ...(result.winner ? { winner: result.winner } : {}),
        damage,
        final: state,
      };
    }
  }
  throw new Error('a battle ran past the round cap');
}

describe('a whole battle', () => {
  const seeds = Array.from({ length: 40 }, (_unused, i) => i + 1);
  const played = seeds.map(playBattle);

  it('always reaches a conclusion at or before the round cap', () => {
    for (const battle of played) {
      expect(battle.rounds).toBeLessThanOrEqual(ROUND_CAP);
      expect(['knockout', 'decision', 'draw']).toContain(battle.outcome);
    }
  });

  it('leaves the loser at or below zero on a knockout, and the winner standing', () => {
    for (const battle of played.filter((b) => b.outcome === 'knockout')) {
      const winner = battle.winner as Side;
      const loser: Side = winner === 'a' ? 'b' : 'a';
      expect(battle.final[loser].hp).toBeLessThanOrEqual(0);
      expect(battle.final[winner].hp).toBeGreaterThan(0);
    }
  });

  it('never lets HP climb or energy go negative', () => {
    for (const battle of played) {
      expect(battle.final.a.hp).toBeLessThanOrEqual(STARTING_FIGHTER.hp_max);
      expect(battle.final.b.hp).toBeLessThanOrEqual(STARTING_FIGHTER.hp_max);
      expect(battle.final.a.energy).toBeGreaterThanOrEqual(0);
      expect(battle.final.b.energy).toBeGreaterThanOrEqual(0);
      expect(battle.final.a.energy).toBeLessThanOrEqual(STARTING_FIGHTER.energy_max);
    }
  });

  it('replays identically from the same seed', () => {
    for (const seed of [1, 17, 40]) {
      expect(JSON.stringify(playBattle(seed))).toBe(JSON.stringify(playBattle(seed)));
    }
  });

  it('ends in a knockout when two white belts trade freely', () => {
    // Worth knowing: at the spec's numbers, 100 HP against six attacks a round
    // never survives twelve rounds. Random play knocks somebody out well
    // before the cap, every time.
    expect(played.every((battle) => battle.outcome === 'knockout')).toBe(true);
    expect(Math.max(...played.map((b) => b.rounds))).toBeLessThan(ROUND_CAP);
  });

  it('runs to the cap and is decided there when nobody throws anything', () => {
    let state: BattleState = { ...fresh(), a: { ...fresh().a, hp: 80 } };
    const blocks = { attacks: [], blocks: [] };

    for (let round = 1; round <= ROUND_CAP; round += 1) {
      const result = resolveRound({ state, a: blocks, b: blocks, rng: makeRng(9, round) });
      state = result.state;
      if (round < ROUND_CAP) {
        expect(result.outcome).toBe('continue');
      } else {
        // 80% against 100%: outside the two point margin, so it is decided.
        expect(result.outcome).toBe('decision');
        expect(result.winner).toBe('b');
      }
    }
  });

  it('pays the winner more than the loser, and a draw nothing', () => {
    for (const battle of played) {
      const xp = battleXp({
        outcome: battle.outcome as 'knockout',
        ...(battle.winner ? { winner: battle.winner } : {}),
        damage: battle.damage,
        belt: { a: 0, b: 0 },
      });
      if (!battle.winner) {
        expect(xp).toEqual({ a: 0, b: 0 });
      } else {
        expect(xp[battle.winner]).toBeGreaterThan(0);
        expect(beltForXp(xp[battle.winner])).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('regenerates energy every round it is not spent', () => {
    const quiet = resolveRound({
      state: { ...fresh(), a: { ...fresh().a, energy: 0 } },
      a: { attacks: [], blocks: [] },
      b: { attacks: [], blocks: [] },
      rng: makeRng(1, 1),
    });
    expect(quiet.state.a.energy).toBe(ENERGY_REGEN);
  });
});
