import {
  ATTRIBUTE_KEYS,
  buyAttribute,
  buyMove,
  xpBalance,
  type AttributeKey,
} from 'engine';
import { HttpError, handler, json } from '../_shared/http.ts';
import { readBody, requireFighter, serviceClient } from '../_shared/supabase.ts';

interface Body {
  action: 'attribute' | 'move';
  attribute?: AttributeKey;
  move_id?: number;
}

Deno.serve(
  handler(async (req) => {
    const admin = serviceClient();
    const me = await requireFighter(req, admin);
    const body = await readBody<Body>(req);

    const { data: ownedRows, error: ownedError } = await admin
      .from('fighter_moves')
      .select('move_id')
      .eq('fighter_id', me.id);
    if (ownedError) throw new HttpError(500, ownedError.message);
    const owned = (ownedRows ?? []).map((row) => row.move_id as number);

    const attributes = {
      strength: me.strength,
      accuracy: me.accuracy,
      evasion: me.evasion,
      toughness: me.toughness,
    };
    const balance = xpBalance(me.xp, attributes, owned);

    if (body.action === 'attribute') {
      const key = body.attribute;
      if (!key || !ATTRIBUTE_KEYS.includes(key)) throw new HttpError(400, 'which attribute?');

      const purchase = buyAttribute(attributes[key], balance);
      if (!purchase.ok) throw new HttpError(409, refusal(purchase.reason, purchase.cost));

      const { data, error } = await admin
        .from('fighters')
        .update({ [key]: purchase.level })
        .eq('id', me.id)
        .select()
        .single();
      if (error) throw new HttpError(500, error.message);
      return json({ fighter: data, spent: purchase.cost, balance: balance - purchase.cost });
    }

    if (body.action === 'move') {
      if (typeof body.move_id !== 'number') throw new HttpError(400, 'which move?');

      const purchase = buyMove(body.move_id, balance, owned);
      if (!purchase.ok) throw new HttpError(409, refusal(purchase.reason, purchase.cost));

      const { error } = await admin
        .from('fighter_moves')
        .insert({ fighter_id: me.id, move_id: body.move_id });
      if (error) throw new HttpError(500, error.message);
      return json({ fighter: me, spent: purchase.cost, balance: balance - purchase.cost });
    }

    throw new HttpError(400, 'unknown action');
  }),
);

function refusal(reason: string, cost: number): string {
  switch (reason) {
    case 'at_cap':
      return 'that attribute is as high as it goes';
    case 'insufficient_xp':
      return `that costs ${cost} XP and you do not have it`;
    case 'already_owned':
      return 'you already know that one';
    default:
      return 'no such move';
  }
}
