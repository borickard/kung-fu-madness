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
