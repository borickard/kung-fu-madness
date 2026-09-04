-- The one transactional write in the game.
--
-- The engine computes a round in the edge function; this commits it. The round
-- log, the battle row and, when the battle ends, both fighter rows move
-- together or not at all. Only the service role may call it.

create or replace function public.commit_round(
  p_battle     uuid,
  p_round      int,
  p_events     jsonb,
  p_hp_a       int,
  p_hp_b       int,
  p_energy_a   int,
  p_energy_b   int,
  p_next_round int,
  p_deadline   timestamptz,
  p_timeouts_a int,
  p_timeouts_b int,
  p_finished   boolean,
  p_outcome    text default null,
  p_winner     uuid default null,
  p_xp_a       int default 0,
  p_xp_b       int default 0,
  p_belt_a     int default null,
  p_belt_b     int default null
)
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  battle public.battles;
begin
  select * into battle from public.battles where id = p_battle for update;
  if not found then
    raise exception 'no such battle %', p_battle;
  end if;
  if battle.status <> 'active' then
    raise exception 'battle % is not active', p_battle;
  end if;
  if battle.round_no <> p_round then
    raise exception 'battle % is on round %, not %', p_battle, battle.round_no, p_round;
  end if;

  insert into public.round_logs (battle_id, round_no, events, hp_a_after, hp_b_after)
  values (p_battle, p_round, p_events, p_hp_a, p_hp_b);

  update public.battles
     set hp_a        = p_hp_a,
         hp_b        = p_hp_b,
         energy_a    = p_energy_a,
         energy_b    = p_energy_b,
         round_no    = p_next_round,
         timeouts_a  = p_timeouts_a,
         timeouts_b  = p_timeouts_b,
         deadline_at = case when p_finished then null else p_deadline end,
         status      = case when p_finished then 'finished' else 'active' end,
         outcome     = coalesce(p_outcome, outcome),
         winner_id   = coalesce(p_winner, winner_id),
         ended_at    = case when p_finished then now() else null end
   where id = p_battle
  returning * into battle;

  if p_finished then
    update public.fighters
       set xp     = xp + p_xp_a,
           belt   = coalesce(p_belt_a, belt),
           wins   = wins   + case when p_winner = battle.fighter_a then 1 else 0 end,
           losses = losses + case when p_winner is not null and p_winner <> battle.fighter_a then 1 else 0 end,
           draws  = draws  + case when p_winner is null then 1 else 0 end
     where id = battle.fighter_a;

    update public.fighters
       set xp     = xp + p_xp_b,
           belt   = coalesce(p_belt_b, belt),
           wins   = wins   + case when p_winner = battle.fighter_b then 1 else 0 end,
           losses = losses + case when p_winner is not null and p_winner <> battle.fighter_b then 1 else 0 end,
           draws  = draws  + case when p_winner is null then 1 else 0 end
     where id = battle.fighter_b;
  end if;

  return battle;
end;
$$;

revoke execute on function public.commit_round(
  uuid, int, jsonb, int, int, int, int, int, timestamptz, int, int,
  boolean, text, uuid, int, int, int, int
) from public, anon, authenticated;

-- Rankings: belt first, then cumulative XP. Public, like the fighter list.
create view public.rankings
with (security_invoker = on) as
  select id, name, belt, xp, wins, losses, draws, created_at
    from public.fighters
   order by belt desc, xp desc, wins desc, created_at asc;

-- Ending a battle without resolving a round: a walkover, or a challenge that
-- was never accepted. Also service-role only.
create or replace function public.finish_battle(
  p_battle  uuid,
  p_outcome text,
  p_winner  uuid default null,
  p_xp_a    int default 0,
  p_xp_b    int default 0,
  p_belt_a  int default null,
  p_belt_b  int default null
)
returns public.battles
language plpgsql
security definer
set search_path = public
as $$
declare
  battle public.battles;
begin
  select * into battle from public.battles where id = p_battle for update;
  if not found then
    raise exception 'no such battle %', p_battle;
  end if;
  if battle.status = 'finished' then
    raise exception 'battle % has already finished', p_battle;
  end if;

  update public.battles
     set status      = 'finished',
         outcome     = p_outcome,
         winner_id   = p_winner,
         deadline_at = null,
         ended_at    = now()
   where id = p_battle
  returning * into battle;

  update public.fighters
     set xp     = xp + p_xp_a,
         belt   = coalesce(p_belt_a, belt),
         wins   = wins   + case when p_winner = battle.fighter_a then 1 else 0 end,
         losses = losses + case when p_winner is not null and p_winner <> battle.fighter_a then 1 else 0 end,
         draws  = draws  + case when p_winner is null then 1 else 0 end
   where id = battle.fighter_a;

  update public.fighters
     set xp     = xp + p_xp_b,
         belt   = coalesce(p_belt_b, belt),
         wins   = wins   + case when p_winner = battle.fighter_b then 1 else 0 end,
         losses = losses + case when p_winner is not null and p_winner <> battle.fighter_b then 1 else 0 end,
         draws  = draws  + case when p_winner is null then 1 else 0 end
   where id = battle.fighter_b;

  return battle;
end;
$$;

revoke execute on function public.finish_battle(uuid, text, uuid, int, int, int, int)
  from public, anon, authenticated;
