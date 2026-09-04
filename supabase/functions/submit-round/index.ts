import { validateSubmission, type Attack, type Zone } from 'engine';
import { ensureBotSubmissions, loadBattle, loadFighters, resolveIfReady, sideOf } from '../_shared/battle.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { readBody, requireFighter, serviceClient } from '../_shared/supabase.ts';

interface Body {
  battle_id?: string;
  attacks?: Attack[];
  blocks?: Zone[];
}

Deno.serve(
  handler(async (req) => {
    const admin = serviceClient();
    const me = await requireFighter(req, admin);
    const body = await readBody<Body>(req);
    if (!body.battle_id) throw new HttpError(400, 'which battle?');

    const battle = await loadBattle(admin, body.battle_id);
    if (battle.status !== 'active') throw new HttpError(409, 'that battle is not running');
    sideOf(battle, me.id); // throws unless the caller is one of the two

    const { data: owned, error: ownedError } = await admin
      .from('fighter_moves')
      .select('move_id')
      .eq('fighter_id', me.id);
    if (ownedError) throw new HttpError(500, ownedError.message);

    const submission = { attacks: body.attacks ?? [], blocks: body.blocks ?? [] };
    const problems = validateSubmission(
      submission,
      (owned ?? []).map((row) => row.move_id as number),
    );
    if (problems.length > 0) throw new HttpError(400, problems.join('; '));

    const { error: insertError } = await admin.from('submissions').insert({
      battle_id: battle.id,
      round_no: battle.round_no,
      fighter_id: me.id,
      attacks: submission.attacks,
      blocks: submission.blocks,
    });
    if (insertError) {
      if (insertError.code === '23505') throw new HttpError(409, 'you have already committed this round');
      throw new HttpError(500, insertError.message);
    }

    // A bot answers straight away, so a practice round resolves on the spot.
    await ensureBotSubmissions(admin, battle, await loadFighters(admin, battle));

    // Both in on time: neither is running a timeout streak any more.
    const resolution = await resolveIfReady(admin, battle, { a: 0, b: 0 }, new Date());
    return json({
      resolved: resolution.resolved,
      battle: resolution.battle,
      events: resolution.events ?? null,
    });
  }),
);
