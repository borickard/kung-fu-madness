# KFM

An asynchronous PvP martial arts browser game. Two players secretly commit three attacks and three blocks per round, the server resolves the round, a text log tells the story. Remake of Kung Fu Madness (2000–2009).

Full game rules, numbers and data model: `docs/SPEC.md`. That file is the source of truth for every balance value. Do not invent numbers that are not in it, and do not change one without saying so.

## Stack

* `web/` — Vite + React + TypeScript + Tailwind, shadcn/ui for primitives
* `packages/engine/` — pure TypeScript combat engine, zero I/O, zero framework imports
* `supabase/migrations/` — SQL migrations, applied in order, never edited after being applied
* `supabase/functions/` — Deno edge functions, the only writer to `battles`, `submissions` resolution and `round_logs`

Postgres runs locally through the Supabase CLI. No ORM: plain SQL and generated types.

## Local checkout

On Rickard's Mac this repo lives at `/Users/rickard/Kod/kung-fu-madness`. Clone
and pull there, not into the home directory or wherever a terminal happens to
be sitting.

```bash
cd /Users/rickard/Kod
git clone https://github.com/borickard/kung-fu-madness
```

## Commands

```bash
pnpm install
pnpm supabase start            # local Postgres + API on :54321
pnpm supabase db reset         # re-apply migrations + seed
pnpm gen:types                 # regenerate web/src/lib/database.types.ts
pnpm --filter engine test      # vitest, the engine suite, must stay green
pnpm --filter engine test --coverage
pnpm dev                       # web on :5173
pnpm test                      # engine + web tests
pnpm typecheck && pnpm lint
```

After changing anything under `supabase/migrations/`, run `pnpm supabase db reset` and `pnpm gen:types`.

## Invariants

These are correctness requirements, not preferences. Breaking any of them is a bug even if the feature appears to work.

1. A player can never read another player's submission for an unresolved round. Not through the API, not through an RLS gap, not through a join. Enforced by RLS on `submissions` plus a test that asserts a select as player B returns zero rows for player A's submission.
2. Round resolution never runs in the browser. The client submits and renders resolved rounds. The engine is called from the edge function only.
3. Resolution is deterministic given `(battle.seed, round_no, both submissions)`. The engine takes an injected RNG. No `Math.random()` anywhere in `packages/engine/`.
4. The engine is pure. No fetch, no Supabase client, no Date.now(). Time and randomness are arguments.
5. All balance values live in one module, `packages/engine/src/balance.ts`, mirroring `docs/SPEC.md`. Nothing hardcodes a number inline.

## Conventions

* Zones are the string union in `packages/engine/src/types.ts`, never free strings.
* Money-shaped and stat-shaped numbers are integers. Damage is rounded once, at the end of the per-attack calculation.
* Migrations are additive and named `NNNN_short_description.sql`.
* Combat log events are structured data (`{ kind, attacker, move, zone, amount }`), rendered to text in the UI. Do not store prerendered strings.
* Copy tone is dry and slightly absurd, in the spirit of the original: `Richard was High Punched for 57 points of damage`. No epic fantasy voice.

## Working agreement

* Write the test before or with the logic for anything in `packages/engine/`. The test list in `docs/SPEC.md` section 10 is the minimum bar.
* Do not add features that `docs/SPEC.md` lists as out of scope. Ask first.
* Prefer one screen working end to end over several half-built ones.
* Run `pnpm test && pnpm typecheck` before saying a milestone is done.

## Checking the database without Docker

`pnpm test:db` applies the migrations and the seed to a throwaway Postgres
cluster and runs `supabase/tests/*_test.sql` against it: the RLS assertions
from SPEC section 10 and the behaviour of `commit_round` and `finish_battle`.
It needs Postgres 15+ binaries on the machine and nothing else. Run it after
touching anything under `supabase/`.
