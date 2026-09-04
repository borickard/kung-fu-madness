-- Battles, the secret submissions, and the resolved round logs.
--
-- The one policy to get right is on submissions: nothing here grants a fighter
-- read access to anyone else's row, resolved or not. The edge function reads
-- both rows with the service role and publishes the result as a round log.

create table public.battles (
  id          uuid primary key default gen_random_uuid(),
  fighter_a   uuid not null references public.fighters (id) on delete cascade,
  fighter_b   uuid not null references public.fighters (id) on delete cascade,
  status      text not null check (status in ('pending', 'active', 'finished')),
  round_no    int not null,
  seed        bigint not null,
  hp_a        int not null,
  hp_b        int not null,
  energy_a    int not null,
  energy_b    int not null,
  deadline_at timestamptz,
  timeouts_a  int not null default 0,
  timeouts_b  int not null default 0,
  winner_id   uuid references public.fighters (id),
  outcome     text check (outcome in ('knockout', 'decision', 'draw', 'walkover')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  check (fighter_a <> fighter_b)
);

-- One live battle per pair of fighters, in either direction.
create unique index battles_one_live_per_pair
  on public.battles (least(fighter_a, fighter_b), greatest(fighter_a, fighter_b))
  where status <> 'finished';

create index battles_fighter_a_idx on public.battles (fighter_a, status);
create index battles_fighter_b_idx on public.battles (fighter_b, status);
create index battles_deadline_idx on public.battles (deadline_at) where status = 'active';

create table public.submissions (
  battle_id    uuid not null references public.battles (id) on delete cascade,
  round_no     int not null,
  fighter_id   uuid not null references public.fighters (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  attacks      jsonb not null,
  blocks       jsonb not null,
  primary key (battle_id, round_no, fighter_id)
);

create table public.round_logs (
  battle_id   uuid not null references public.battles (id) on delete cascade,
  round_no    int not null,
  events      jsonb not null,
  hp_a_after  int not null,
  hp_b_after  int not null,
  resolved_at timestamptz not null default now(),
  primary key (battle_id, round_no)
);

-- Row level security ---------------------------------------------------------

alter table public.battles enable row level security;
alter table public.submissions enable row level security;
alter table public.round_logs enable row level security;

create or replace function public.owns_fighter(fighter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fighters f
    where f.id = fighter and f.user_id = auth.uid()
  );
$$;

create or replace function public.in_battle(battle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.battles b
    join public.fighters f on f.id in (b.fighter_a, b.fighter_b)
    where b.id = battle and f.user_id = auth.uid()
  );
$$;

-- battles: the two participants may read. There is no client write policy at
-- all; the edge functions write with the service role.
create policy "participants read their battles" on public.battles
  for select using (
    public.owns_fighter(fighter_a) or public.owns_fighter(fighter_b)
  );

-- submissions: your own row, and only your own. No condition, anywhere,
-- exposes the other fighter's row.
create policy "a fighter reads only their own submission" on public.submissions
  for select using (public.owns_fighter(fighter_id));

create or replace function public.can_submit(battle uuid, round int, fighter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.battles b
    join public.fighters f on f.id = fighter
    where b.id = battle
      and b.status = 'active'
      and b.round_no = round
      and f.user_id = auth.uid()
      and fighter in (b.fighter_a, b.fighter_b)
  );
$$;

create policy "a fighter writes only their own submission" on public.submissions
  for insert with check (public.can_submit(battle_id, round_no, fighter_id));

-- round_logs: readable by the participants once written. Never client-written.
create policy "participants read their round logs" on public.round_logs
  for select using (public.in_battle(battle_id));
