-- The move catalog, mirroring packages/engine/src/balance.ts.
-- packages/engine/test/seed.test.ts fails if these drift apart.

insert into public.moves (id, name, hit_pct, spd, avg_dmg, range, crit_pct, crit_mult, eng, xp_cost) values
  (1, 'Jab',         92, 9,  7, 1,  4, 1.5,  2,   0),
  (2, 'High Punch',  80, 7, 13, 1,  8, 1.8,  4,   0),
  (3, 'Low Punch',   84, 7, 11, 1,  6, 1.8,  3,   0),
  (4, 'Front Kick',  72, 5, 19, 2, 10, 2.0,  6, 120),
  (5, 'Sweep',       68, 6, 15, 1,  9, 2.0,  5, 180),
  (6, 'Elbow',       88, 8, 12, 0,  7, 1.7,  4, 240),
  (7, 'Roundhouse',  62, 4, 26, 2, 14, 2.2,  8, 400),
  (8, 'Flying Kick', 48, 3, 38, 3, 20, 2.5, 12, 800)
on conflict (id) do update set
  name = excluded.name, hit_pct = excluded.hit_pct, spd = excluded.spd,
  avg_dmg = excluded.avg_dmg, range = excluded.range, crit_pct = excluded.crit_pct,
  crit_mult = excluded.crit_mult, eng = excluded.eng, xp_cost = excluded.xp_cost;

-- Three practice opponents, one per belt at the bottom of the ladder. Their
-- attributes are paid for out of their XP at the costs in balance.ts: the
-- Dummy has spent nothing, Brick has toughness 2 (160), the Caretaker has
-- strength 2 and accuracy 2 (320) plus Front Kick (120).

insert into public.fighters
  (id, user_id, name, belt, xp, hp_max, energy_max, strength, accuracy, evasion, toughness,
   wins, losses, draws, is_listed_in_arena, is_bot)
values
  ('10000000-0000-4000-8000-000000000001', null, 'Wooden Dummy',  0,   0, 100, 20, 1, 1, 1, 1, 0, 0, 0, true, true),
  ('10000000-0000-4000-8000-000000000002', null, 'Brick',         1, 300, 100, 20, 1, 1, 1, 2, 0, 0, 0, true, true),
  ('10000000-0000-4000-8000-000000000003', null, 'The Caretaker', 2, 900, 100, 20, 2, 2, 1, 1, 0, 0, 0, true, true)
on conflict (id) do nothing;

insert into public.fighter_moves (fighter_id, move_id)
select f.id, m.move_id
  from (values
    ('10000000-0000-4000-8000-000000000001'::uuid, 1), ('10000000-0000-4000-8000-000000000001'::uuid, 2), ('10000000-0000-4000-8000-000000000001'::uuid, 3),
    ('10000000-0000-4000-8000-000000000002'::uuid, 1), ('10000000-0000-4000-8000-000000000002'::uuid, 2), ('10000000-0000-4000-8000-000000000002'::uuid, 3),
    ('10000000-0000-4000-8000-000000000003'::uuid, 1), ('10000000-0000-4000-8000-000000000003'::uuid, 2), ('10000000-0000-4000-8000-000000000003'::uuid, 3),
    ('10000000-0000-4000-8000-000000000003'::uuid, 4)
  ) as m(fighter_id, move_id)
  join public.fighters f on f.id = m.fighter_id
on conflict do nothing;
