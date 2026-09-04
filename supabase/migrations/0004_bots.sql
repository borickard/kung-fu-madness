-- Bots: fighters with nobody behind them.
--
-- A bot has no user_id, which is exactly what makes it safe. `owns_fighter`
-- compares user_id to auth.uid(), and null never equals anything, so no client
-- can ever own a bot, read its submissions or write a round on its behalf. The
-- edge functions play it with the service role.

alter table public.fighters
  add column is_bot boolean not null default false;

alter table public.fighters
  alter column user_id drop not null;

alter table public.fighters
  add constraint fighters_bots_have_no_account
  check ((is_bot and user_id is null) or (not is_bot and user_id is not null));

create index fighters_bot_idx on public.fighters (is_bot);

-- Rankings are for people.
create or replace view public.rankings
with (security_invoker = on) as
  select id, name, belt, xp, wins, losses, draws, created_at
    from public.fighters
   where is_bot is false
   order by belt desc, xp desc, wins desc, created_at asc;
