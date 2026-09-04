-- The move catalog again, for the three-zone game.
--
-- The basics are now Jab, Punch and Kick: the zone is the player's choice
-- every round, so it has no business being in the move's name. "High Punch"
-- and "Low Punch" become Punch and Kick, and Front Kick is retired because
-- the free Kick now carries its numbers.
--
-- The newest *_move_catalog.sql is the live catalog, and
-- packages/engine/test/seed.test.ts pins it to balance.ts.

delete from public.fighter_moves where move_id = 4;
delete from public.moves where id = 4;

insert into public.moves (id, name, hit_pct, spd, avg_dmg, range, crit_pct, crit_mult, eng, xp_cost) values
  (1, 'Jab',         92, 9,  7, 1,  4, 1.5,  2,   0),
  (2, 'Punch',       84, 7, 12, 1,  7, 1.8,  3,   0),
  (3, 'Kick',        72, 5, 19, 2, 10, 2.0,  6,   0),
  (5, 'Sweep',       68, 6, 15, 1,  9, 2.0,  5, 180),
  (6, 'Elbow',       88, 8, 12, 0,  7, 1.7,  4, 240),
  (7, 'Roundhouse',  62, 4, 26, 2, 14, 2.2,  8, 400),
  (8, 'Flying Kick', 48, 3, 38, 3, 20, 2.5, 12, 800)
on conflict (id) do update set
  name = excluded.name, hit_pct = excluded.hit_pct, spd = excluded.spd,
  avg_dmg = excluded.avg_dmg, range = excluded.range, crit_pct = excluded.crit_pct,
  crit_mult = excluded.crit_mult, eng = excluded.eng, xp_cost = excluded.xp_cost;

-- Every fighter owns the three free moves, including anyone created before
-- Kick was one of them.
insert into public.fighter_moves (fighter_id, move_id)
select f.id, m.id from public.fighters f cross join public.moves m where m.xp_cost = 0
on conflict do nothing;

-- The Caretaker loses Front Kick, so give it back its paid move.
insert into public.fighter_moves (fighter_id, move_id)
values ('10000000-0000-4000-8000-000000000003', 5)
on conflict do nothing;

-- Zones changed shape at the same time, so any round already committed under
-- the six-zone grid can no longer be resolved against a three-zone block.
delete from public.submissions
 where blocks::text like '%\_LEFT%' or blocks::text like '%\_RIGHT%'
    or attacks::text like '%\_LEFT%' or attacks::text like '%\_RIGHT%';
