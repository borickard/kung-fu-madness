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

cp web/.env.example web/.env.local   # paste the API URL and anon key `supabase start` printed
```

Then two terminals, both from the repository root:

```bash
pnpm functions:serve           # edge functions on :54321/functions/v1
pnpm dev                       # web on :5173
```

`pnpm functions:serve` syncs the engine into `supabase/functions/_shared/engine`
first (gitignored, regenerated every time, never edited) so the edge runtime can
load it wherever it mounts the project. `packages/engine/src` remains the only
source; `pnpm functions:deploy` does the same before deploying.

To play a battle you need two fighters, so sign up twice — a second browser
profile or a private window is enough. Challenge from the Arena, accept from
Current Battles, then both sides commit a round; the second submission
resolves it and the log appears.

The sweep is a scheduled call, not a background worker. Point cron, a GitHub
Action or `supabase functions schedule` at it hourly:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sweep-deadlines" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Nothing else needs it: a round resolves the moment the second player commits.
The sweep only exists for the player who never comes back.

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
Check it with:

```bash
deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
```

## Where the numbers live

`packages/engine/src/balance.ts`, mirroring `docs/SPEC.md`, and nowhere else.
The one copy — the `moves` table seed — is pinned by a test that fails the
moment the two disagree. SQL holds no starting stat, no cost and no deadline:
they arrive from the engine through an edge function.

## Deploying

The web app is a static build; everything with state lives in a hosted Supabase
project. Create one at supabase.com and take its **project ref** from the
dashboard URL (`https://supabase.com/dashboard/project/<ref>`).

Push the schema and the functions from the repository root:

```bash
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm supabase db push
pnpm functions:deploy
```

`db push` applies `supabase/migrations/` in order, which is why the move
catalog and the practice bots are migrations rather than seed data — the seed
never runs against a hosted project.

In the Supabase dashboard, under Authentication:

- Set **Site URL** to the Vercel domain, and add it to **Redirect URLs**.
- Under Providers → Email, turn **Confirm email** off unless you have configured
  SMTP. With it on, nobody can sign up without a working mail sender.

In Vercel, under Settings → Environment Variables, add both and then redeploy.
Vite bakes these in at build time, so a variable added after a build does not
reach the running site until the next one:

| name | value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's publishable key (`sb_publishable_…`) |

The publishable key is meant to be public — RLS is what protects the data. The
secret key belongs only in the Supabase project's own function environment,
never in Vercel and never in the browser bundle.

`vercel.json` carries the build command, the output directory and the rewrite
that keeps client-side routes working on a hard refresh. If the Vercel project
has a Root Directory set to `web`, clear it: the build runs from the repository
root so the workspace can resolve `engine`.

Deadlines only need sweeping if a human abandons a battle; bots answer
instantly. To automate it, schedule `sweep-deadlines` from the dashboard under
Integrations → Cron, or call it yourself:

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/sweep-deadlines" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
