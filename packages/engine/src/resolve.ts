import {
  ACCURACY_WEIGHT,
  ATTACKS_PER_ROUND,
  BLOCKS_PER_ROUND,
  DAMAGE_SPREAD_MIN,
  DAMAGE_SPREAD_RANGE,
  DECISION_MARGIN,
  ENERGY_REGEN,
  HIT_CHANCE_MAX,
  HIT_CHANCE_MIN,
  MITIGATION_NONE,
  MOVES_BY_ID,
  ROUND_CAP,
  STRENGTH_DAMAGE_PER_POINT,
  TOUGHNESS_REDUCTION_PER_POINT,
  mitigationFor,
} from './balance.ts';
import {
  isZone,
  other,
  type BattleState,
  type FighterState,
  type LogEvent,
  type Move,
  type Outcome,
  type Rng,
  type RoundResult,
  type Side,
  type Submission,
  type Zone,
} from './types.ts';

interface QueuedAttack {
  side: Side;
  move: Move;
  zone: Zone;
  /** RNG tie-break key: decides the order of equal-speed attacks. */
  tie: number;
}

function copyFighter(f: FighterState): FighterState {
  return { ...f };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function countGuards(blocks: readonly Zone[], zone: Zone): number {
  let guards = 0;
  for (const block of blocks) if (block === zone) guards += 1;
  return guards;
}

function hpPercent(f: FighterState): number {
  return (f.hp / f.hp_max) * 100;
}

/**
 * Resolve one round. Pure: no clock, no randomness beyond `rng`, no mutation
 * of the state that was passed in.
 */
export function resolveRound(input: {
  state: BattleState;
  a: Submission;
  b: Submission;
  rng: Rng;
  /** Move catalog. Defaults to the balance module; injectable for tests. */
  moves?: ReadonlyMap<number, Move>;
}): RoundResult {
  const { rng } = input;
  const catalog = input.moves ?? MOVES_BY_ID;
  const moveFor = (move_id: number): Move => {
    const move = catalog.get(move_id);
    if (!move) throw new Error(`unknown move_id ${move_id}`);
    return move;
  };
  const fighters: Record<Side, FighterState> = {
    a: copyFighter(input.state.a),
    b: copyFighter(input.state.b),
  };
  const submissions: Record<Side, Submission> = { a: input.a, b: input.b };
  const events: LogEvent[] = [];
  const damage: Record<Side, number> = { a: 0, b: 0 };

  // 1. Energy regen, capped.
  for (const side of ['a', 'b'] as const) {
    const f = fighters[side];
    f.energy = Math.min(f.energy_max, f.energy + ENERGY_REGEN);
  }

  // 2. One queue of all six attacks, fastest first, ties broken by the RNG.
  const queue: QueuedAttack[] = [];
  for (const side of ['a', 'b'] as const) {
    for (const attack of submissions[side].attacks) {
      queue.push({
        side,
        move: moveFor(attack.move_id),
        zone: attack.zone,
        tie: rng.float(),
      });
    }
  }
  queue.sort((x, y) => y.move.spd - x.move.spd || x.tie - y.tie);

  // 3. Resolve each attack in order.
  for (const queued of queue) {
    const attackerSide = queued.side;
    const defenderSide = other(attackerSide);
    const attacker = fighters[attackerSide];
    const defender = fighters[defenderSide];
    const { move, zone } = queued;

    // Knocked out earlier this round: the rest of their round never happens.
    if (attacker.hp <= 0) continue;

    if (attacker.energy < move.eng) {
      events.push({
        kind: 'fizzle',
        attacker: attackerSide,
        move: move.name,
        move_id: move.id,
        zone,
      });
      continue;
    }
    attacker.energy -= move.eng;

    const guards = countGuards(submissions[defenderSide].blocks, zone);
    const mitigation = mitigationFor(guards);

    const hitChance = clamp(
      move.hit_pct + (attacker.accuracy - defender.evasion) * ACCURACY_WEIGHT,
      HIT_CHANCE_MIN,
      HIT_CHANCE_MAX,
    );
    if (rng.int(100) > hitChance) {
      events.push({ kind: 'miss', attacker: attackerSide, move: move.name, move_id: move.id, zone });
      continue;
    }

    let dealt =
      move.avg_dmg *
      (DAMAGE_SPREAD_MIN + rng.float() * DAMAGE_SPREAD_RANGE) *
      (1 + attacker.strength * STRENGTH_DAMAGE_PER_POINT);

    // A blocked zone can never crit, and never rolls for one.
    const crit = mitigation === MITIGATION_NONE && rng.int(100) <= move.crit_pct;
    if (crit) dealt *= move.crit_mult;

    dealt *= (1 - mitigation) * (1 - defender.toughness * TOUGHNESS_REDUCTION_PER_POINT);
    const amount = Math.round(dealt);

    defender.hp -= amount;
    damage[attackerSide] += amount;
    events.push({
      kind: 'hit',
      attacker: attackerSide,
      move: move.name,
      move_id: move.id,
      zone,
      amount,
      crit,
      guards,
      hp_after: defender.hp,
    });
  }

  // 4. Outcome.
  const downA = fighters.a.hp <= 0;
  const downB = fighters.b.hp <= 0;
  let outcome: Outcome;
  let winner: Side | undefined;

  if (downA && downB) {
    outcome = 'draw';
  } else if (downA || downB) {
    outcome = 'knockout';
    winner = downA ? 'b' : 'a';
  } else if (input.state.round_no >= ROUND_CAP) {
    outcome = 'decision';
    const spread = hpPercent(fighters.a) - hpPercent(fighters.b);
    if (Math.abs(spread) <= DECISION_MARGIN) {
      outcome = 'draw';
    } else {
      winner = spread > 0 ? 'a' : 'b';
    }
  } else {
    outcome = 'continue';
  }

  if (outcome !== 'continue') {
    events.push(winner ? { kind: 'end', outcome, winner } : { kind: 'end', outcome });
  }

  return {
    state: {
      round_no: outcome === 'continue' ? input.state.round_no + 1 : input.state.round_no,
      a: fighters.a,
      b: fighters.b,
    },
    events,
    outcome,
    ...(winner ? { winner } : {}),
    damage: { a: damage.a, b: damage.b },
  };
}

/**
 * Shape check for a submission arriving from a client. Returns the problems
 * found, empty when the submission is legal.
 */
export function validateSubmission(
  submission: Submission,
  ownedMoveIds?: readonly number[],
): string[] {
  const problems: string[] = [];
  const attacks = submission?.attacks;
  const blocks = submission?.blocks;

  if (!Array.isArray(attacks) || attacks.length !== ATTACKS_PER_ROUND) {
    problems.push(`attacks must be exactly ${ATTACKS_PER_ROUND} entries`);
  } else {
    for (const attack of attacks) {
      if (!MOVES_BY_ID.has(attack?.move_id)) problems.push(`unknown move_id ${attack?.move_id}`);
      else if (ownedMoveIds && !ownedMoveIds.includes(attack.move_id))
        problems.push(`move ${attack.move_id} is not owned`);
      if (!isZone(attack?.zone)) problems.push(`invalid zone ${String(attack?.zone)}`);
    }
  }

  if (!Array.isArray(blocks) || blocks.length !== BLOCKS_PER_ROUND) {
    problems.push(`blocks must be exactly ${BLOCKS_PER_ROUND} entries`);
  } else {
    for (const block of blocks) {
      if (!isZone(block)) problems.push(`invalid block zone ${String(block)}`);
    }
  }

  return problems;
}
