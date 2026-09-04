-- The security tests from SPEC section 10, run against the schema itself.
--
--   ./scripts/db-check.sh
--
-- Everything happens inside one transaction that is rolled back at the end,
-- so the database is left exactly as it was found.

\set ON_ERROR_STOP on
\set QUIET on

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set fighter_a '33333333-3333-3333-3333-333333333333'
\set fighter_b '44444444-4444-4444-4444-444444444444'
\set battle '55555555-5555-5555-5555-555555555555'

begin;

insert into auth.users (id, email) values
  (:'user_a', 'a@example.test'),
  (:'user_b', 'b@example.test');

insert into public.fighters
  (id, user_id, name, belt, xp, hp_max, energy_max, strength, accuracy, evasion, toughness,
   wins, losses, draws, is_listed_in_arena)
values
  (:'fighter_a', :'user_a', 'Ada', 0, 0, 100, 20, 1, 1, 1, 1, 0, 0, 0, true),
  (:'fighter_b', :'user_b', 'Bo',  0, 0, 100, 20, 1, 1, 1, 1, 0, 0, 0, true);

insert into public.battles
  (id, fighter_a, fighter_b, status, round_no, seed, hp_a, hp_b, energy_a, energy_b, deadline_at)
values
  (:'battle', :'fighter_a', :'fighter_b', 'active', 1, 4242, 100, 100, 20, 20, now() + interval '1 hour');

-- A commits a round -----------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true) \g /dev/null

insert into public.submissions (battle_id, round_no, fighter_id, attacks, blocks)
values (:'battle', 1, :'fighter_a',
        '[{"move_id":1,"zone":"MID_LEFT"}]'::jsonb,
        '["MID_LEFT","MID_RIGHT","HIGH_RIGHT"]'::jsonb);

do $$
declare mine int;
begin
  select count(*) into mine from public.submissions;
  assert mine = 1, 'a fighter cannot read their own submission';
end
$$;

-- B looks for it --------------------------------------------------------------

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'user_b', true) \g /dev/null

do $$
declare seen int;
begin
  select count(*) into seen from public.submissions;
  assert seen = 0, 'INVARIANT 1: player B can see a submission that is not theirs';

  select count(*) into seen
    from public.submissions
   where fighter_id = '33333333-3333-3333-3333-333333333333';
  assert seen = 0, 'INVARIANT 1: player B can read player A''s submission row';

  -- Nor through a join back to the battle they are legitimately part of.
  select count(*) into seen
    from public.battles b
    join public.submissions s on s.battle_id = b.id
   where b.id = '55555555-5555-5555-5555-555555555555';
  assert seen = 0, 'INVARIANT 1: a join leaks player A''s submission';
end
$$;

do $$
declare refused boolean := false;
begin
  begin
    insert into public.submissions (battle_id, round_no, fighter_id, attacks, blocks)
    values ('55555555-5555-5555-5555-555555555555', 1,
            '33333333-3333-3333-3333-333333333333', '[]'::jsonb, '[]'::jsonb);
  exception when others then refused := true;
  end;
  assert refused, 'player B could write a submission on player A''s behalf';
end
$$;

-- The battle row itself -------------------------------------------------------

do $$
declare touched int;
        hp int;
begin
  begin
    with changed as (
      update public.battles set hp_a = 1
       where id = '55555555-5555-5555-5555-555555555555'
      returning 1
    )
    select count(*) into touched from changed;
  exception when others then touched := 0;
  end;
  assert touched = 0, 'a client changed battles.hp_a';

  set local role postgres;
  select hp_a into hp from public.battles where id = '55555555-5555-5555-5555-555555555555';
  assert hp = 100, 'battles.hp_a moved after a client update';
end
$$;

-- Participants can read their own battle and its logs --------------------------

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'user_b', true) \g /dev/null

do $$
declare seen int;
begin
  select count(*) into seen from public.battles;
  assert seen = 1, 'a participant cannot read their own battle';

  begin
    insert into public.round_logs (battle_id, round_no, events, hp_a_after, hp_b_after)
    values ('55555555-5555-5555-5555-555555555555', 1, '[]'::jsonb, 90, 90);
    assert false, 'a client wrote a round log';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end
$$;

-- Fighter rows: the toggle yes, the ledger no ---------------------------------

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true) \g /dev/null

update public.fighters set is_listed_in_arena = false
 where id = :'fighter_a';

do $$
declare refused boolean := false;
        xp_now int;
begin
  begin
    update public.fighters set xp = 999999
     where id = '33333333-3333-3333-3333-333333333333';
  exception when others then refused := true;
  end;
  assert refused, 'a client handed itself XP';

  set local role postgres;
  select xp into xp_now from public.fighters
   where id = '33333333-3333-3333-3333-333333333333';
  assert xp_now = 0, 'fighters.xp moved after a client update';
end
$$;

-- Bots belong to nobody ---------------------------------------------------------

reset role;

insert into public.battles
  (id, fighter_a, fighter_b, status, round_no, seed, hp_a, hp_b, energy_a, energy_b, deadline_at)
values
  ('66666666-6666-6666-6666-666666666666', :'fighter_a',
   '10000000-0000-4000-8000-000000000001', 'active', 1, 99, 100, 100, 20, 20, now() + interval '1 hour');

set role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true) \g /dev/null

do $$
declare touched int;
        listed int;
        refused boolean := false;
begin
  -- A bot is public to read, like any fighter.
  select count(*) into listed from public.fighters where is_bot;
  assert listed = 3, 'the practice bots are not readable';

  -- But nobody owns one, so nobody can change it.
  with changed as (
    update public.fighters set is_listed_in_arena = false where is_bot returning 1
  )
  select count(*) into touched from changed;
  assert touched = 0, 'a client changed a bot fighter';

  -- And above all, nobody can play its hand.
  begin
    insert into public.submissions (battle_id, round_no, fighter_id, attacks, blocks)
    values ('66666666-6666-6666-6666-666666666666', 1,
            '10000000-0000-4000-8000-000000000001', '[]'::jsonb, '[]'::jsonb);
  exception when others then refused := true;
  end;
  assert refused, 'a client submitted a round on a bot''s behalf';

  select count(*) into listed from public.rankings where name = 'Wooden Dummy';
  assert listed = 0, 'a bot turned up in the rankings';
end
$$;

-- Resolution stays on the server ----------------------------------------------

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true) \g /dev/null

do $$
declare refused boolean := false;
begin
  begin
    perform public.commit_round(
      '55555555-5555-5555-5555-555555555555', 1, '[]'::jsonb,
      1, 1, 1, 1, 2, now(), 0, 0, false);
  exception when others then refused := true;
  end;
  assert refused, 'a client called commit_round';
end
$$;

reset role;
rollback;

\echo 'rls_test: every assertion held'
