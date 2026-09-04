# KFM — game specification

Source of truth for rules and balance. Every number here belongs in `packages/engine/src/balance.ts`. Reconstructed from archived pages of kungfumadness.com; where the archive is silent the value is a deliberate design choice, marked *(chosen)*.

---

## 1. Shape of the game

Asynchronous, turn-based PvP. No real-time combat, no canvas, no animation. A battle is a sequence of rounds. Each round both players secretly submit three attacks and three block zones, the server resolves them together, and a structured log records what happened. A battle may take two minutes or two days.

## 2. Core loop

1. Sign up, create one fighter: name, starting attributes, white belt.
2. Open the Arena, filter by belt, list yourself as available or challenge someone.
3. Challenge accepted creates a battle with status `active`, visible in both players' Current Battles.
4. Each round both players submit `{attacks: [{move_id, zone} x3], blocks: [zone x3]}` before the deadline.
5. Second submission (or deadline sweep) triggers resolution. HP updates, log is written, new deadline set.
6. Repeat to knockout, decision or walkover.
7. Both players gain XP, the loser too. Spend XP on attributes and moves. Belts follow cumulative XP.

## 3. Zones

Six target zones, always describing the **opponent's** body:

```ts
type Zone = 'HIGH_LEFT' | 'HIGH_RIGHT' | 'MID_LEFT' | 'MID_RIGHT' | 'LOW_LEFT' | 'LOW_RIGHT';
```

Per round a fighter picks exactly three attacks, each with a move and a zone, and exactly three block zones. Repeats are allowed on both sides. Blocking the same zone twice increases mitigation, three times increases it slightly more.

## 4. Move catalog

Column names are the original game's own, taken from its attack filter screen. Values *(chosen)*.

| name | hit_pct | spd | avg_dmg | range | crit_pct | crit_mult | eng | xp_cost |
|---|---|---|---|---|---|---|---|---|
| Jab | 92 | 9 | 7 | 1 | 4 | 1.5 | 2 | 0 |
| High Punch | 80 | 7 | 13 | 1 | 8 | 1.8 | 4 | 0 |
| Low Punch | 84 | 7 | 11 | 1 | 6 | 1.8 | 3 | 0 |
| Front Kick | 72 | 5 | 19 | 2 | 10 | 2.0 | 6 | 120 |
| Sweep | 68 | 6 | 15 | 1 | 9 | 2.0 | 5 | 180 |
| Elbow | 88 | 8 | 12 | 0 | 7 | 1.7 | 4 | 240 |
| Roundhouse | 62 | 4 | 26 | 2 | 14 | 2.2 | 8 | 400 |
| Flying Kick | 48 | 3 | 38 | 3 | 20 | 2.5 | 12 | 800 |

A new fighter owns the three zero-cost moves. `range` is stored but unused in v1; distance mechanics are out of scope.

## 5. Resolution

Engine signature, pure:

```ts
resolveRound(input: {
  state: BattleState;          // hp, energy, attributes for both sides
  a: Submission; b: Submission;
  rng: Rng;                    // seeded, injected
}): {
  state: BattleState;
  events: LogEvent[];
  outcome: 'continue' | 'knockout' | 'draw' | 'decision';
  winner?: 'a' | 'b';
}
```

Steps, in order:

1. Both fighters regain `ENERGY_REGEN = 5` energy, capped at `energy_max`.
2. All six attacks go into one queue sorted by `move.spd` descending. Ties are broken by the injected RNG, not by insertion order.
3. For each queued attack:
   - attacker HP at or below 0 → skip, they were knocked out earlier in this round
   - `attacker.energy < move.eng` → emit `fizzle`, skip
   - deduct `move.eng`
   - `guards` = count of the defender's three block picks equal to this zone
   - `mitigation` = `guards === 0 ? 0 : guards === 1 ? 0.80 : 0.92`
   - `hit_chance = clamp(move.hit_pct + (attacker.accuracy - defender.evasion) * 1.5, 15, 97)`; `rng.int(100) > hit_chance` → emit `miss`, skip
   - `damage = move.avg_dmg * (0.75 + rng.float() * 0.5) * (1 + attacker.strength * 0.04)`
   - `crit = mitigation === 0 && rng.int(100) <= move.crit_pct`; if so `damage *= move.crit_mult`
   - `damage *= (1 - mitigation) * (1 - defender.toughness * 0.03)`
   - `damage = Math.round(damage)`, subtract from defender HP, emit `hit`
4. Outcome:
   - both at or below 0 HP → `draw`
   - one at or below 0 HP → `knockout`
   - `round_no >= ROUND_CAP (12)` → `decision`, higher remaining HP percentage wins; within `DECISION_MARGIN = 2` percentage points it is a `draw`
   - otherwise `continue`

Crit is impossible against a blocked zone. That is deliberate: it makes a correct block read feel decisive.

`rng.int(n)` returns a uniform integer in `[1, n]` inclusive, so `hit_pct` and `crit_pct` read as exact percentages.

## 6. Progression

Starting fighter: `hp_max 100`, `energy_max 20`, `strength 1`, `accuracy 1`, `evasion 1`, `toughness 1`.

- **Attribute cost:** `40 * level^2` XP for the step to `level`. Cap 25 per attribute *(chosen)*.
- **XP balance:** `fighters.xp` is cumulative XP earned and never decreases; the spendable balance is that total minus the cost of every attribute level and move already bought. Belt and balance therefore both derive from the one column *(chosen)*.
- **XP:** `damage_dealt` to both fighters, plus `60 * (1 + 0.25 * max(0, belt_difference))` to the winner. A draw pays nothing at all, which is how the original behaved. No XP is ever deducted for losing.
  `belt_difference` is `loser_belt - winner_belt`: the bonus grows when you beat someone above you and never shrinks below the base 60 *(chosen reading; the archive only shows that the bonus exists)*.
- **Repeat-opponent decay:** XP from battles against the same opponent inside 24 hours scales 1.0, 0.5, 0.25, then 0. Prevents alt-account farming.
- **Belts,** cumulative XP: White 0, Yellow 300, Orange 900, Green 2000, Blue 4000, Purple 7000, Brown 11000, Red 16000, Black 22000, then 1st through 10th Dan at 22000 + 8000 per dan. Belt order and the existence of dan grades are from the archive; thresholds are *(chosen)*.
- Arena defaults to opponents within one belt step, with a toggle to widen.

## 7. Asynchronous handling

- **Deadline:** 24 hours per submission, stored as `battles.deadline_at`, reset on each resolution.
- **Timeout:** a scheduled sweep inserts a default submission for the missing player — no attacks, blocks on `MID_LEFT`, `MID_RIGHT`, `HIGH_RIGHT` — and resolves the round. `timeouts_a` / `timeouts_b` increments; three consecutive timeouts is a walkover to the opponent.
- One active battle per pair of fighters at a time.
- Current Battles groups rows: awaiting you, awaiting opponent, finished. Nav shows the count awaiting you.

## 8. Data model

```sql
fighters(id uuid pk, user_id uuid unique, name text unique, belt int,
         xp int, hp_max int, energy_max int,
         strength int, accuracy int, evasion int, toughness int,
         wins int, losses int, draws int,
         is_listed_in_arena bool, created_at timestamptz)

moves(id int pk, name text, hit_pct int, spd int, avg_dmg int, range int,
      crit_pct int, crit_mult numeric, eng int, xp_cost int)

fighter_moves(fighter_id uuid, move_id int, hidden bool default false,
              primary key (fighter_id, move_id))

battles(id uuid pk, fighter_a uuid, fighter_b uuid,
        status text,             -- pending | active | finished
        round_no int, seed bigint,
        hp_a int, hp_b int, energy_a int, energy_b int,
        deadline_at timestamptz, timeouts_a int, timeouts_b int,
        winner_id uuid null, created_at timestamptz, ended_at timestamptz null)

submissions(battle_id uuid, round_no int, fighter_id uuid,
            submitted_at timestamptz,
            attacks jsonb, blocks jsonb,
            primary key (battle_id, round_no, fighter_id))

round_logs(battle_id uuid, round_no int, events jsonb,
           hp_a_after int, hp_b_after int, resolved_at timestamptz,
           primary key (battle_id, round_no))
```

**RLS:**

- `fighters` — public read, owner write.
- `submissions` — a fighter may insert and select **only their own row**. No policy grants read access to another fighter's row under any condition. This is the one policy to get right.
- `battles` — the two participants may select. No client write policy at all; the edge function writes with the service role.
- `round_logs` — the two participants may select. No client write policy.

Resolution path: client posts to the `submit-round` edge function, which inserts the submission, checks whether both rows exist, and if so loads state, calls `resolveRound` from `packages/engine`, then writes `round_logs` and the updated `battles` row in one transaction. A `sweep-deadlines` function runs on a schedule for expired rounds.

## 9. Screens

| Screen | Contents |
|---|---|
| Create fighter | Name, starting attributes read-only, one button |
| Current Battles | The three groups, HP bars, round number, time left. Landing page |
| Arena | Listed fighters with belt and record, Challenge button, belt filter, List-me toggle |
| Combat entry | Six-zone grid for attacks, six-zone grid for blocks, move picker showing the full stat row. Submit is irreversible and says so |
| Round log | One line per event, HP after each round, whole battle scrollable from round 1 |
| Fighter sheet | Attributes, owned moves, belt, record, XP balance |
| Power up | Buy attribute levels and moves, next cost shown |
| Rankings | Top fighters by belt then XP |

Combat entry is the heart of the game: one screen, no dialogs, obvious which of the three attack slots and three block slots are filled.

## 10. Engine test list

Minimum bar for `pnpm --filter engine test`. Each uses a fixed seed.

**Resolution order**
- attacks resolve in descending `spd`
- equal `spd` order is decided by the RNG, and identical seeds produce identical order
- a fighter knocked out by an earlier attack in the same round does not land their remaining attacks

**Blocking**
- `guards = 0` applies no mitigation
- `guards = 1` applies exactly 0.80
- `guards = 2` and `3` apply exactly 0.92
- a blocked zone can never produce a crit, tested with `crit_pct = 100`

**Hit and damage**
- `hit_chance` is clamped to [15, 97] at extreme accuracy and evasion spreads
- damage scales with attacker strength and shrinks with defender toughness
- damage is rounded exactly once
- `crit_mult` multiplies before mitigation and toughness are applied

**Energy**
- energy is deducted on a hit, a miss and a block alike
- insufficient energy emits `fizzle` and deducts nothing
- regen is 5 per round, capped at `energy_max`

**Outcomes**
- both fighters at or below 0 HP is a `draw` and pays zero XP to both
- one at or below 0 is a `knockout` to the other
- round 12 with unequal HP is a `decision` to the higher HP percentage
- round 12 within 2 percentage points is a `draw`

**Determinism**
- the same `(seed, round_no, submissions)` produces byte-identical events, run twice
- no `Math.random()` reference exists in `packages/engine/src` (lint rule or a grep test)

**Security, integration level**
- selecting player A's `submissions` row as player B returns zero rows
- a direct client update of `battles.hp_a` is rejected by RLS

**Progression, unit level**
- attribute cost follows `40 * level^2` and refuses purchases above the cap or beyond the XP balance
- belt is derived from cumulative XP at each threshold boundary, tested at the exact values
- repeat-opponent XP decay produces 1.0, 0.5, 0.25, 0 across four battles inside 24 hours

## 11. Milestones

1. Scaffold, Supabase local, `fighters` with RLS, create-fighter, fighter sheet, `moves` seeded.
2. `packages/engine` with types, balance module, `resolveRound` and the full test list green. No UI. **This is the milestone that matters; do it before any battle UI.**
3. Arena: list, browse, challenge, accept, battle row created.
4. Combat entry, `submissions` with strict RLS, the security tests passing. No resolution yet.
5. `submit-round` edge function wiring the engine, `round_logs`, round log screen.
6. Current Battles with deadlines and countdown, `sweep-deadlines`, default submissions, walkovers.
7. XP, attribute and move purchases, belt thresholds, rankings.

## 12. Out of scope for v1

Gold, shop and equipment. Dojos and team rankings. Range and distance. Chat, forums, activity feeds. Blessings, divine favour, donations. Multi-round status effects. More than one fighter per account. Do not add any of these without asking.

## 13. Visual direction

Not a modern SaaS dashboard. No gradient hero, no glassmorphism, no rounded purple cards. A lean administrative interface that could plausibly have run in 2003, executed cleanly: near-white ground, hairline rules, dense tables, monospace for every number and the whole combat log, one restrained accent colour, and at most one black ink-brush silhouette as decoration. Slab serif headings, plain grotesque interface text, monospace data. Dark mode with the same restraint.

## 14. Provenance

From the archive: the round loop, the attack stat columns (`H%`, `Spd`, `Avg`, `Range`, `C%`, `Cx`, `Eng`), belt progression through black belt into dan grades, dojos of up to ten players, XP without a loss penalty, draws paying nothing, the per-round countdown, and the log format `<name> was <move> for <n> points of damage`.

Chosen by us: every numeric value, the six-zone grid, mitigation figures, the round cap, decision rules, XP formulas and belt thresholds.

Not from the archive: the original's second version used one attack plus one stance per round. The three-and-three model specified here is the first version's, and is the one worth rebuilding.
