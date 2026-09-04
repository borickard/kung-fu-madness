import { randomSeed } from 'engine';
import { deadlineFrom, loadBattle, loadFighters } from '../_shared/battle.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { readBody, requireFighter, serviceClient } from '../_shared/supabase.ts';

interface Body {
  action: 'challenge' | 'accept' | 'decline';
  opponent_id?: string;
  battle_id?: string;
}

function seed(): number {
  const source = () => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) / 0x100000000;
  };
  return Number(randomSeed(source));
}

Deno.serve(
  handler(async (req) => {
    const admin = serviceClient();
    const me = await requireFighter(req, admin);
    const body = await readBody<Body>(req);

    if (body.action === 'challenge') {
      if (!body.opponent_id) throw new HttpError(400, 'challenge whom?');
      if (body.opponent_id === me.id) throw new HttpError(400, 'you cannot fight yourself');

      const { data: opponent, error: opponentError } = await admin
        .from('fighters')
        .select('*')
        .eq('id', body.opponent_id)
        .maybeSingle();
      if (opponentError) throw new HttpError(500, opponentError.message);
      if (!opponent) throw new HttpError(404, 'no such fighter');

      // A bot has nobody to consider the offer, so it is already on the mat.
      const accepted = opponent.is_bot;
      const { data, error } = await admin
        .from('battles')
        .insert({
          fighter_a: me.id,
          fighter_b: opponent.id,
          status: accepted ? 'active' : 'pending',
          round_no: 1,
          seed: seed(),
          hp_a: me.hp_max,
          hp_b: opponent.hp_max,
          energy_a: me.energy_max,
          energy_b: opponent.energy_max,
          deadline_at: accepted ? deadlineFrom(new Date()) : null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') throw new HttpError(409, 'you two already have a battle going');
        throw new HttpError(500, error.message);
      }
      return json({ battle: data }, 201);
    }

    if (!body.battle_id) throw new HttpError(400, 'which battle?');
    const battle = await loadBattle(admin, body.battle_id);
    if (battle.status !== 'pending') throw new HttpError(409, 'that challenge is settled');

    if (body.action === 'accept') {
      if (battle.fighter_b !== me.id) throw new HttpError(403, 'that challenge is not yours to accept');
      const fighters = await loadFighters(admin, battle);
      const { data, error } = await admin
        .from('battles')
        .update({
          status: 'active',
          deadline_at: deadlineFrom(new Date()),
          hp_a: fighters.a.hp_max,
          hp_b: fighters.b.hp_max,
          energy_a: fighters.a.energy_max,
          energy_b: fighters.b.energy_max,
        })
        .eq('id', battle.id)
        .eq('status', 'pending')
        .select()
        .single();
      if (error) throw new HttpError(500, error.message);
      return json({ battle: data });
    }

    if (body.action === 'decline') {
      if (battle.fighter_a !== me.id && battle.fighter_b !== me.id) {
        throw new HttpError(403, 'not your challenge');
      }
      const { error } = await admin.from('battles').delete().eq('id', battle.id);
      if (error) throw new HttpError(500, error.message);
      return json({ battle: null });
    }

    throw new HttpError(400, 'unknown action');
  }),
);
