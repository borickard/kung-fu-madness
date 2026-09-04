import { STARTING_FIGHTER, STARTING_MOVE_IDS } from 'engine';
import { HttpError, handler, json } from '../_shared/http.ts';
import { readBody, requireUser, serviceClient } from '../_shared/supabase.ts';

const NAME_PATTERN = /^[\p{L}\p{N} '_-]{2,24}$/u;

Deno.serve(
  handler(async (req) => {
    const admin = serviceClient();
    const user = await requireUser(req, admin);
    const { name } = await readBody<{ name?: string }>(req);
    const trimmed = (name ?? '').trim();

    if (!NAME_PATTERN.test(trimmed)) {
      throw new HttpError(400, 'two to twenty-four letters, numbers, spaces, dashes');
    }

    const { data: existing } = await admin
      .from('fighters')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) throw new HttpError(409, 'one fighter per account');

    const { data: fighter, error } = await admin
      .from('fighters')
      .insert({
        user_id: user.id,
        name: trimmed,
        belt: 0,
        xp: 0,
        hp_max: STARTING_FIGHTER.hp_max,
        energy_max: STARTING_FIGHTER.energy_max,
        strength: STARTING_FIGHTER.strength,
        accuracy: STARTING_FIGHTER.accuracy,
        evasion: STARTING_FIGHTER.evasion,
        toughness: STARTING_FIGHTER.toughness,
        wins: 0,
        losses: 0,
        draws: 0,
        is_listed_in_arena: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new HttpError(409, 'that name is taken');
      throw new HttpError(500, error.message);
    }

    const { error: movesError } = await admin
      .from('fighter_moves')
      .insert(STARTING_MOVE_IDS.map((move_id) => ({ fighter_id: fighter.id, move_id })));
    if (movesError) throw new HttpError(500, movesError.message);

    return json({ fighter }, 201);
  }),
);
