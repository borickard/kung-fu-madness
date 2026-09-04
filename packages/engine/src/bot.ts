import {
  ATTACKS_PER_ROUND,
  BLOCKS_PER_ROUND,
  BOT_BLOCK_READ,
  BOT_GREED,
  BOT_MEMORY_ROUNDS,
  BOT_ZONE_REPEAT,
  ENERGY_REGEN,
  MOVES_BY_ID,
} from './balance.ts';
import { makeRng } from './rng.ts';
import {
  ZONES,
  type Attack,
  type FighterState,
  type Move,
  type Rng,
  type Submission,
  type Zone,
} from './types.ts';

/**
 * Keeps the bot's dice off the stream the same round's resolution will use.
 * Not a balance value: a stream separator.
 */
const BOT_STREAM_OFFSET = 1_000_003;

export interface BotInput {
  /** The battle seed, so a bot's round is reproducible like everything else. */
  seed: number | bigint;
  round_no: number;
  /** The bot's own state, for budgeting energy. */
  self: FighterState;
  moveIds: readonly number[];
  /**
   * Zones the opponent has attacked in earlier rounds, oldest first. The bot
   * guards where it has been hit before, which is what a person does.
   */
  seen?: readonly Zone[];
  moves?: ReadonlyMap<number, Move>;
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  const item = list[rng.int(list.length) - 1];
  if (item === undefined) throw new Error('cannot pick from an empty list');
  return item;
}

/** Damage a move can be expected to land, before anybody's attributes. */
function worth(move: Move): number {
  return move.avg_dmg * move.hit_pct;
}

function best(moves: readonly Move[]): Move {
  return moves.reduce((champion, move) => (worth(move) > worth(champion) ? move : champion));
}

function cheapest(moves: readonly Move[]): Move {
  return moves.reduce((quietest, move) => (move.eng < quietest.eng ? move : quietest));
}

/**
 * A bot's round. Pure and seeded: the same battle, round and history always
 * produce the same three attacks and three blocks.
 *
 * It is not trying to be a champion. It spends the energy it has, favours the
 * heavier move more often than not, doubles up on a zone now and then, and
 * guards where it has been hit lately.
 */
export function botSubmission(input: BotInput): Submission {
  const rng = makeRng(input.seed, input.round_no + BOT_STREAM_OFFSET);
  const catalog = input.moves ?? MOVES_BY_ID;

  const known = input.moveIds.flatMap((id) => {
    const move = catalog.get(id);
    return move ? [move] : [];
  });
  if (known.length === 0) throw new Error('a bot needs at least one move');

  let budget = Math.min(input.self.energy_max, input.self.energy + ENERGY_REGEN);
  const attacks: Attack[] = [];
  const aimed: Zone[] = [];

  for (let slot = 0; slot < ATTACKS_PER_ROUND; slot += 1) {
    const affordable = known.filter((move) => move.eng <= budget);
    // Nothing affordable: throw the cheapest thing it knows and let it fizzle,
    // the same mistake a person makes when they overspend early.
    const pool = affordable.length > 0 ? affordable : [cheapest(known)];

    const move = rng.float() < BOT_GREED ? best(pool) : pick(rng, pool);
    budget = Math.max(0, budget - move.eng);

    const zone =
      aimed.length > 0 && rng.float() < BOT_ZONE_REPEAT ? pick(rng, aimed) : pick(rng, ZONES);
    aimed.push(zone);
    attacks.push({ move_id: move.id, zone });
  }

  const memory = (input.seen ?? []).slice(-BOT_MEMORY_ROUNDS * ATTACKS_PER_ROUND);
  const blocks: Zone[] = [];
  for (let slot = 0; slot < BLOCKS_PER_ROUND; slot += 1) {
    const reading = memory.length > 0 && rng.float() < BOT_BLOCK_READ;
    blocks.push(reading ? pick(rng, memory) : pick(rng, ZONES));
  }

  return { attacks, blocks };
}

/** The zones one side attacked, read back out of resolved rounds. */
export function zonesAttackedBy(
  side: 'a' | 'b',
  rounds: readonly { events: readonly { kind: string; attacker?: string; zone?: Zone }[] }[],
): Zone[] {
  const zones: Zone[] = [];
  for (const round of rounds) {
    for (const event of round.events) {
      if (event.kind !== 'end' && event.attacker === side && event.zone) zones.push(event.zone);
    }
  }
  return zones;
}
