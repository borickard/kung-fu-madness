# Kung Fu Madness

An asynchronous PvP martial arts browser game. Two players secretly commit
three attacks and three blocks per round, the server resolves the round, and a
text log tells the story. A remake of Kung Fu Madness (2000–2009).

The rules, every balance value and the data model live in [`docs/SPEC.md`](docs/SPEC.md).
Working notes for contributors are in [`CLAUDE.md`](CLAUDE.md).

## Layout

| Path | What it is |
|---|---|
| `packages/engine/` | The combat engine. Pure TypeScript, no I/O, no framework, no clock, no `Math.random`. |
| `supabase/migrations/` | Schema and row level security, applied in order. |
| `supabase/functions/` | Deno edge functions. The only writer to battles, submissions and round logs. |
| `web/` | Vite + React + TypeScript + Tailwind. Submits rounds and renders resolved ones. |

## Getting it running

```bash
pnpm install
pnpm supabase start            # local Postgres + API on :54321, needs Docker
pnpm supabase db reset         # apply migrations, seed the move catalog
pnpm gen:types                 # regenerate web/src/lib/database.types.ts

cp web/.env.example web/.env.local   # paste the URL and anon key `supabase start` printed
pnpm supabase functions serve --env-file supabase/.env   # from the repo root
pnpm dev                       # web on :5173
```

Run `supabase functions serve` from the repository root: the functions import
the engine through `supabase/functions/deno.json`, which points at
`packages/engine/src`, so the engine sources have to be inside the served
project directory. That import map is what keeps one copy of the balance
numbers.

The sweep is a scheduled call, not a background worker. Point cron, a GitHub
Action or `supabase functions schedule` at it hourly:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sweep-deadlines" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

## Checks

```bash
pnpm --filter engine test            # the engine suite, the one that must stay green
pnpm --filter engine test --coverage
pnpm test                            # engine + web
pnpm typecheck && pnpm lint
```

The schema, its policies and the two transactional writes are checked against
a throwaway Postgres cluster, no Docker required:

```bash
pnpm test:db                         # migrations, seed, then supabase/tests/*_test.sql
```

That is where the row level security is proved: it asserts that player B
cannot read player A's submission through a select, a filter or a join, that a
client cannot move `battles.hp_a` or its own XP, and that `commit_round` is not
callable from the client at all. `supabase/tests/shim_auth.sql` stands in for
the parts of Supabase the migrations lean on and is never applied to a real
project.

The same ground is covered through the API by an integration test that needs a
live local stack, so it is skipped unless you ask for it:

```bash
KFM_INTEGRATION=1 \
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
pnpm --filter web test
```

`supabase/functions/` is Deno, so it sits outside the ESLint and tsc passes.
Check it with `deno check supabase/functions/**/*.ts` if you have Deno on hand.

## Where the numbers live

`packages/engine/src/balance.ts`, mirroring `docs/SPEC.md`, and nowhere else.
The one copy — the `moves` table seed — is pinned by a test that fails the
moment the two disagree. SQL holds no starting stat, no cost and no deadline:
they arrive from the engine through an edge function.
