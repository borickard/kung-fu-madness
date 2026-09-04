/**
 * Every balance value in the game, mirroring `docs/SPEC.md`.
 * Nothing anywhere else may hardcode one of these numbers inline.
 */
import type { Move, Zone } from './types.ts';

// --- Round shape -----------------------------------------------------------

export const ATTACKS_PER_ROUND = 3;
export const BLOCKS_PER_ROUND = 3;
export const ROUND_CAP = 12;

// --- Energy ----------------------------------------------------------------

export const ENERGY_REGEN = 5;

// --- Blocking --------------------------------------------------------------
//
// There is no mitigation table any more. An exchange is one attack against one
// block: guess the zone and the whole blow is stopped, guess wrong and all of
// it lands. One in three, both ways, three times a round.

// --- Hit chance ------------------------------------------------------------

export const HIT_CHANCE_MIN = 15;
export const HIT_CHANCE_MAX = 97;
/** Percentage points of hit chance per point of accuracy over evasion. */
export const ACCURACY_WEIGHT = 1.5;

// --- Damage ----------------------------------------------------------------

export const DAMAGE_SPREAD_MIN = 0.75;
export const DAMAGE_SPREAD_RANGE = 0.5;
export const STRENGTH_DAMAGE_PER_POINT = 0.04;
export const TOUGHNESS_REDUCTION_PER_POINT = 0.03;

// --- Outcomes --------------------------------------------------------------

/** Percentage points of remaining HP within which a decision is a draw. */
export const DECISION_MARGIN = 2;

// --- Fighters --------------------------------------------------------------

export const STARTING_FIGHTER = {
  hp_max: 100,
  energy_max: 20,
  strength: 1,
  accuracy: 1,
  evasion: 1,
  toughness: 1,
} as const;

export const ATTRIBUTE_COST_FACTOR = 40;
export const ATTRIBUTE_CAP = 25;
export const ATTRIBUTE_KEYS = ['strength', 'accuracy', 'evasion', 'toughness'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

// --- XP --------------------------------------------------------------------

export const WIN_XP_BASE = 60;
export const WIN_XP_PER_BELT_STEP = 0.25;
/** Multipliers for the 1st, 2nd, 3rd... battle against the same opponent inside the window. */
export const REPEAT_OPPONENT_DECAY = [1, 0.5, 0.25, 0] as const;
export const REPEAT_OPPONENT_WINDOW_HOURS = 24;

// --- Belts -----------------------------------------------------------------

export const DAN_COUNT = 10;
export const DAN_XP_STEP = 8000;

/** Cumulative XP thresholds, index is the stored `fighters.belt`. */
export const BELTS: readonly { name: string; xp: number }[] = [
  { name: 'White', xp: 0 },
  { name: 'Yellow', xp: 300 },
  { name: 'Orange', xp: 900 },
  { name: 'Green', xp: 2000 },
  { name: 'Blue', xp: 4000 },
  { name: 'Purple', xp: 7000 },
  { name: 'Brown', xp: 11000 },
  { name: 'Red', xp: 16000 },
  { name: 'Black', xp: 22000 },
  ...Array.from({ length: DAN_COUNT }, (_unused, i) => ({
    name: `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} Dan`,
    xp: 22000 + DAN_XP_STEP * (i + 1),
  })),
];

/** Arena default: opponents within this many belt steps. */
export const ARENA_BELT_SPREAD = 1;

// --- Asynchronous handling -------------------------------------------------

export const DEADLINE_HOURS = 24;
export const TIMEOUT_WALKOVER = 3;
/** What the sweep submits for a player who missed the deadline. */
export const DEFAULT_BLOCKS: readonly Zone[] = ['MID', 'MID', 'HIGH'];

// --- Moves -----------------------------------------------------------------

// The three basics are a straight speed-for-weight trade, and every one of
// them can be thrown high, mid or low. The zone is the player's choice, so it
// is not baked into the name.
export const MOVES: readonly Move[] = [
  { id: 1, name: 'Jab',         hit_pct: 92, spd: 9, avg_dmg: 7,  range: 1, crit_pct: 4,  crit_mult: 1.5, eng: 2,  xp_cost: 0 },
  { id: 2, name: 'Punch',       hit_pct: 84, spd: 7, avg_dmg: 12, range: 1, crit_pct: 7,  crit_mult: 1.8, eng: 3,  xp_cost: 0 },
  { id: 3, name: 'Kick',        hit_pct: 72, spd: 5, avg_dmg: 19, range: 2, crit_pct: 10, crit_mult: 2.0, eng: 6,  xp_cost: 0 },
  { id: 5, name: 'Sweep',       hit_pct: 68, spd: 6, avg_dmg: 15, range: 1, crit_pct: 9,  crit_mult: 2.0, eng: 5,  xp_cost: 180 },
  { id: 6, name: 'Elbow',       hit_pct: 88, spd: 8, avg_dmg: 12, range: 0, crit_pct: 7,  crit_mult: 1.7, eng: 4,  xp_cost: 240 },
  { id: 7, name: 'Roundhouse',  hit_pct: 62, spd: 4, avg_dmg: 26, range: 2, crit_pct: 14, crit_mult: 2.2, eng: 8,  xp_cost: 400 },
  { id: 8, name: 'Flying Kick', hit_pct: 48, spd: 3, avg_dmg: 38, range: 3, crit_pct: 20, crit_mult: 2.5, eng: 12, xp_cost: 800 },
];

export const MOVES_BY_ID: ReadonlyMap<number, Move> = new Map(MOVES.map((m) => [m.id, m]));

/** The moves a new fighter owns. */
export const STARTING_MOVE_IDS: readonly number[] = MOVES.filter((m) => m.xp_cost === 0).map(
  (m) => m.id,
);

// --- Bots ------------------------------------------------------------------
// A bot is a fighter with nobody behind it. These decide how it plays; the
// engine picks its round, the edge function submits it. All *(chosen)*.

/** Chance an attack takes the best expected-damage move the bot can afford. */
export const BOT_GREED = 0.6;
/** Chance an attack reuses a zone the bot has already picked this round. */
export const BOT_ZONE_REPEAT = 0.25;
/** Chance a block is drawn from the zones the opponent has been using. */
export const BOT_BLOCK_READ = 0.5;
/** How many of the opponent's past rounds the bot weighs when blocking. */
export const BOT_MEMORY_ROUNDS = 3;
