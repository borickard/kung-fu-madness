-- The transactional writes, exercised: a round that continues, a round that
-- ends a battle, a walkover, and the one-live-battle-per-pair rule.
-- Rolled back at the end, like every test here.

\set ON_ERROR_STOP on
\set QUIET on

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'
\set fighter_a '33333333-3333-3333-3333-333333333333'
\set fighter_b '44444444-4444-4444-4444-444444444444'
\set battle '55555555-5555-5555-5555-555555555555'

begin;

insert into auth.users (id, email) values (:'user_a', 'a@example.test'), (:'user_b', 'b@example.test');

insert into public.fighters
  (id, user_id, name, belt, xp, hp_max, energy_max, strength, accuracy, evasion, toughness,
   wins, losses, draws, is_listed_in_arena)
values
  (:'fighter_a', :'user_a', 'Ada', 0, 250, 100, 20, 1, 1, 1, 1, 2, 1, 0, true),
  (:'fighter_b', :'user_b', 'Bo',  0, 100, 100, 20, 1, 1, 1, 1, 0, 3, 0, true);

insert into public.battles
  (id, fighter_a, fighter_b, status, round_no, seed, hp_a, hp_b, energy_a, energy_b, deadline_at)
values
  (:'battle', :'fighter_a', :'fighter_b', 'active', 1, 4242, 100, 100, 20, 20, now() + interval '1 hour');

-- A round that continues -------------------------------------------------------

do $$
declare b public.battles;
        logs int;
begin
  b := public.commit_round(
    p_battle => '55555555-5555-5555-5555-555555555555',
    p_round => 1,
    p_events => '[{"kind":"hit","attacker":"a","move":"Jab","move_id":1,"zone":"MID_LEFT","amount":9,"crit":false,"guards":0,"hp_after":91}]'::jsonb,
    p_hp_a => 100, p_hp_b => 91, p_energy_a => 23, p_energy_b => 25,
    p_next_round => 2, p_deadline => now() + interval '24 hours',
    p_timeouts_a => 0, p_timeouts_b => 0, p_finished => false);

  assert b.status = 'active', 'a continuing round finished the battle';
  assert b.round_no = 2, 'the round did not advance';
  assert b.hp_b = 91, 'HP did not move';
  assert b.deadline_at is not null, 'no new deadline was set';
  assert b.ended_at is null, 'a continuing battle was given an end';

  select count(*) into logs from public.round_logs
   where battle_id = '55555555-5555-5555-5555-555555555555';
  assert logs = 1, 'the round log was not written';
end
$$;

-- The same round cannot be committed twice -------------------------------------

do $$
declare refused boolean := false;
begin
  begin
    perform public.commit_round(
      '55555555-5555-5555-5555-555555555555', 1, '[]'::jsonb,
      100, 91, 23, 25, 2, now(), 0, 0, false);
  exception when others then refused := true;
  end;
  assert refused, 'a round was committed twice';
end
$$;

-- A round that ends it ---------------------------------------------------------

do $$
declare b public.battles;
        a_row public.fighters;
        b_row public.fighters;
begin
  b := public.commit_round(
    p_battle => '55555555-5555-5555-5555-555555555555',
    p_round => 2,
    p_events => '[{"kind":"end","outcome":"knockout","winner":"a"}]'::jsonb,
    p_hp_a => 100, p_hp_b => -4, p_energy_a => 20, p_energy_b => 20,
    p_next_round => 2, p_deadline => now() + interval '24 hours',
    p_timeouts_a => 0, p_timeouts_b => 0, p_finished => true,
    p_outcome => 'knockout', p_winner => '33333333-3333-3333-3333-333333333333',
    p_xp_a => 164, p_xp_b => 40, p_belt_a => 1, p_belt_b => 0);

  assert b.status = 'finished', 'the battle did not finish';
  assert b.deadline_at is null, 'a finished battle kept its deadline';
  assert b.ended_at is not null, 'a finished battle has no end time';
  assert b.winner_id = '33333333-3333-3333-3333-333333333333', 'the wrong winner was recorded';

  select * into a_row from public.fighters where id = '33333333-3333-3333-3333-333333333333';
  select * into b_row from public.fighters where id = '44444444-4444-4444-4444-444444444444';

  assert a_row.xp = 250 + 164, 'the winner was paid the wrong XP';
  assert b_row.xp = 100 + 40, 'the loser was paid the wrong XP';
  assert a_row.belt = 1, 'the winner did not move up a belt';
  assert a_row.wins = 3 and a_row.losses = 1 and a_row.draws = 0, 'the winner''s record is wrong';
  assert b_row.wins = 0 and b_row.losses = 4 and b_row.draws = 0, 'the loser''s record is wrong';
end
$$;

-- A draw pays nothing and counts for both --------------------------------------

do $$
declare drawn uuid := gen_random_uuid();
        a_row public.fighters;
begin
  insert into public.battles
    (id, fighter_a, fighter_b, status, round_no, seed, hp_a, hp_b, energy_a, energy_b, deadline_at)
  values (drawn, '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
          'active', 12, 7, 40, 40, 20, 20, now());

  perform public.commit_round(
    p_battle => drawn, p_round => 12, p_events => '[{"kind":"end","outcome":"draw"}]'::jsonb,
    p_hp_a => 40, p_hp_b => 40, p_energy_a => 20, p_energy_b => 20,
    p_next_round => 12, p_deadline => now(), p_timeouts_a => 0, p_timeouts_b => 0,
    p_finished => true, p_outcome => 'draw');

  select * into a_row from public.fighters where id = '33333333-3333-3333-3333-333333333333';
  assert a_row.draws = 1, 'a draw was not recorded for both fighters';
  assert a_row.xp = 250 + 164, 'a draw paid something';
end
$$;

-- Walkover ---------------------------------------------------------------------

do $$
declare walked uuid := gen_random_uuid();
        b public.battles;
begin
  insert into public.battles
    (id, fighter_a, fighter_b, status, round_no, seed, hp_a, hp_b, energy_a, energy_b, deadline_at)
  values (walked, '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
          'active', 3, 9, 70, 55, 20, 20, now() - interval '1 hour');

  b := public.finish_battle(walked, 'walkover', '44444444-4444-4444-4444-444444444444', 0, 90, 0, 0);
  assert b.status = 'finished', 'the walkover did not finish the battle';
  assert b.outcome = 'walkover', 'the outcome was not recorded';
  assert b.winner_id = '44444444-4444-4444-4444-444444444444', 'the wrong fighter walked over';
end
$$;

-- One live battle per pair -----------------------------------------------------

do $$
declare refused boolean := false;
begin
  insert into public.battles
    (fighter_a, fighter_b, status, round_no, seed, hp_a, hp_b, energy_a, energy_b)
  values ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
          'pending', 1, 11, 100, 100, 20, 20);
  begin
    -- The same pair the other way round is still the same pair.
    insert into public.battles
      (fighter_a, fighter_b, status, round_no, seed, hp_a, hp_b, energy_a, energy_b)
    values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333',
            'pending', 1, 12, 100, 100, 20, 20);
  exception when unique_violation then refused := true;
  end;
  assert refused, 'a pair of fighters opened two live battles';
end
$$;

rollback;

\echo 'commit_round_test: every assertion held'
