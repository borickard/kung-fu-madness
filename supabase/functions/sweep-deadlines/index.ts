import { DEFAULT_BLOCKS, TIMEOUT_WALKOVER } from 'engine';
import {
  ensureBotSubmissions,
  finishWalkover,
  loadBattle,
  loadFighters,
  resolveIfReady,
  type BattleRow,
} from '../_shared/battle.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

/** Not a public endpoint: the scheduler presents the service role key. */
function requireSweeper(req: Request): void {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = Deno.env.get('SWEEP_SECRET');
  if (secret && req.headers.get('x-sweep-secret') === secret) return;
  if (service && req.headers.get('Authorization') === `Bearer ${service}`) return;
  throw new HttpError(401, 'the sweep is not open to the public');
}

Deno.serve(
  handler(async (req) => {
    requireSweeper(req);
    const admin = serviceClient();
    const now = new Date();

    const { data, error } = await admin
      .from('battles')
      .select('*')
      .eq('status', 'active')
      .lt('deadline_at', now.toISOString())
      .limit(200);
    if (error) throw new HttpError(500, error.message);

    const swept: { battle_id: string; result: string }[] = [];

    for (const row of (data ?? []) as BattleRow[]) {
      const battle = await loadBattle(admin, row.id); // re-read: another writer may have moved it
      if (battle.status !== 'active' || !battle.deadline_at) continue;
      if (new Date(battle.deadline_at) > now) continue;

      const { data: submitted, error: submittedError } = await admin
        .from('submissions')
        .select('fighter_id')
        .eq('battle_id', battle.id)
        .eq('round_no', battle.round_no);
      if (submittedError) throw new HttpError(500, submittedError.message);
      const present = new Set((submitted ?? []).map((s) => s.fighter_id as string));

      // A bot never misses a deadline; it just had nothing to answer yet.
      const fighters = await loadFighters(admin, battle);
      if (fighters.a.is_bot || fighters.b.is_bot) {
        await ensureBotSubmissions(admin, battle, fighters);
        present.add(fighters.a.is_bot ? battle.fighter_a : battle.fighter_b);
      }

      const missingA = !present.has(battle.fighter_a);
      const missingB = !present.has(battle.fighter_b);
      if (!missingA && !missingB) {
        // Both are in; the resolution simply never fired. Finish it now.
        await resolveIfReady(admin, battle, { a: battle.timeouts_a, b: battle.timeouts_b }, now);
        swept.push({ battle_id: battle.id, result: 'resolved' });
        continue;
      }

      const timeouts = {
        a: missingA ? battle.timeouts_a + 1 : 0,
        b: missingB ? battle.timeouts_b + 1 : 0,
      };

      const walkoverA = timeouts.a >= TIMEOUT_WALKOVER;
      const walkoverB = timeouts.b >= TIMEOUT_WALKOVER;
      if (walkoverA || walkoverB) {
        await finishWalkover(admin, battle, walkoverA && walkoverB ? null : walkoverA ? 'b' : 'a', now);
        swept.push({ battle_id: battle.id, result: 'walkover' });
        continue;
      }

      const defaults = [
        ...(missingA ? [battle.fighter_a] : []),
        ...(missingB ? [battle.fighter_b] : []),
      ].map((fighter_id) => ({
        battle_id: battle.id,
        round_no: battle.round_no,
        fighter_id,
        attacks: [],
        blocks: [...DEFAULT_BLOCKS],
      }));

      const { error: defaultError } = await admin.from('submissions').insert(defaults);
      if (defaultError && defaultError.code !== '23505') {
        throw new HttpError(500, defaultError.message);
      }

      await resolveIfReady(admin, battle, timeouts, now);
      swept.push({ battle_id: battle.id, result: 'defaulted' });
    }

    return json({ swept: swept.length, battles: swept });
  }),
);
