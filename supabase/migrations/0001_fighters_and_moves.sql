-- Fighters, the move catalog, and who owns which move.
-- Balance values are never written here: every starting stat and every cost
-- comes from packages/engine/src/balance.ts by way of an edge function.

create extension if not exists "pgcrypto";

create table public.moves (
  id        int primary key,
  name      text not null unique,
  hit_pct   int not null,
  spd       int not null,
  avg_dmg   int not null,
  range     int not null,
  crit_pct  int not null,
  crit_mult numeric not null,
  eng       int not null,
  xp_cost   int not null
);

create table public.fighters (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users (id) on delete cascade,
  name               text not null unique check (char_length(name) between 2 and 24),
  belt               int not null,
  xp                 int not null check (xp >= 0),
  hp_max             int not null,
  energy_max         int not null,
  strength           int not null,
  accuracy           int not null,
  evasion            int not null,
  toughness          int not null,
  wins               int not null,
  losses             int not null,
  draws              int not null,
  is_listed_in_arena boolean not null,
  created_at         timestamptz not null default now()
);

create index fighters_ranking_idx on public.fighters (belt desc, xp desc);
create index fighters_arena_idx on public.fighters (is_listed_in_arena, belt);

create table public.fighter_moves (
  fighter_id uuid not null references public.fighters (id) on delete cascade,
  move_id    int not null references public.moves (id),
  hidden     boolean not null default false,
  primary key (fighter_id, move_id)
);

-- Row level security ---------------------------------------------------------

alter table public.moves enable row level security;
alter table public.fighters enable row level security;
alter table public.fighter_moves enable row level security;

create policy "moves are public" on public.moves
  for select using (true);

create policy "fighters are public" on public.fighters
  for select using (true);

-- Owner write, but see the trigger below: the only column a client may move
-- is the arena listing toggle. Everything with a balance consequence is
-- written by an edge function with the service role.
create policy "a fighter may update their own row" on public.fighters
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.guard_fighter_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (new.id, new.user_id, new.name, new.belt, new.xp, new.hp_max, new.energy_max,
      new.strength, new.accuracy, new.evasion, new.toughness,
      new.wins, new.losses, new.draws)
     is distinct from
     (old.id, old.user_id, old.name, old.belt, old.xp, old.hp_max, old.energy_max,
      old.strength, old.accuracy, old.evasion, old.toughness,
      old.wins, old.losses, old.draws)
  then
    raise exception 'a client may only change is_listed_in_arena';
  end if;

  return new;
end;
$$;

create trigger fighters_guard_client_writes
  before update on public.fighters
  for each row execute function public.guard_fighter_client_writes();

-- Owned moves are public, except the ones a fighter is hiding from the arena.
create policy "owned moves are visible unless hidden" on public.fighter_moves
  for select using (
    hidden is false
    or exists (
      select 1 from public.fighters f
      where f.id = fighter_moves.fighter_id and f.user_id = auth.uid()
    )
  );

create policy "a fighter may hide their own moves" on public.fighter_moves
  for update using (
    exists (
      select 1 from public.fighters f
      where f.id = fighter_moves.fighter_id and f.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.fighters f
      where f.id = fighter_moves.fighter_id and f.user_id = auth.uid()
    )
  );

create or replace function public.guard_fighter_move_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (new.fighter_id, new.move_id) is distinct from (old.fighter_id, old.move_id) then
    raise exception 'a client may only change hidden';
  end if;

  return new;
end;
$$;

create trigger fighter_moves_guard_client_writes
  before update on public.fighter_moves
  for each row execute function public.guard_fighter_move_client_writes();
