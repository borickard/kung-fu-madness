-- The practice bots, for the same reason the catalog is a migration: a hosted
-- project gets migrations and nothing else.

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
