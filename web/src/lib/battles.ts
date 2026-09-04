import type { BattleRow, FighterRow, RoundLogRow } from './database.types.ts';
import { supabase } from './supabase.ts';

export interface BattleView {
  battle: BattleRow;
  opponent: FighterRow;
  side: 'a' | 'b';
  /** Your HP and your opponent's, whichever side you are on. */
  hp: { mine: number; theirs: number };
  awaitingMe: boolean;
}

export interface BattleGroups {
  awaitingYou: BattleView[];
  awaitingOpponent: BattleView[];
  finished: BattleView[];
}

export async function loadBattleViews(fighter: FighterRow): Promise<BattleView[]> {
  const { data, error } = await supabase
    .from('battles')
    .select('*')
    .or(`fighter_a.eq.${fighter.id},fighter_b.eq.${fighter.id}`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const battles = (data ?? []) as BattleRow[];
  if (battles.length === 0) return [];

  const opponentIds = battles.map((b) => (b.fighter_a === fighter.id ? b.fighter_b : b.fighter_a));
  const { data: opponents, error: opponentError } = await supabase
    .from('fighters')
    .select('*')
    .in('id', opponentIds);
  if (opponentError) throw new Error(opponentError.message);
  const byId = new Map((opponents ?? []).map((f) => [f.id, f as FighterRow]));

  // Only ever your own submissions: the policy does not permit any others.
  const { data: mine } = await supabase
    .from('submissions')
    .select('battle_id, round_no')
    .eq('fighter_id', fighter.id);
  const submitted = new Set((mine ?? []).map((row) => `${row.battle_id}:${row.round_no}`));

  return battles.flatMap((battle) => {
    const side = battle.fighter_a === fighter.id ? 'a' : 'b';
    const opponent = byId.get(side === 'a' ? battle.fighter_b : battle.fighter_a);
    if (!opponent) return [];
    const awaitingMe =
      battle.status === 'active'
        ? !submitted.has(`${battle.id}:${battle.round_no}`)
        : battle.status === 'pending' && side === 'b';
    return [
      {
        battle,
        opponent,
        side,
        hp: {
          mine: side === 'a' ? battle.hp_a : battle.hp_b,
          theirs: side === 'a' ? battle.hp_b : battle.hp_a,
        },
        awaitingMe,
      },
    ];
  });
}

export function groupBattles(views: BattleView[]): BattleGroups {
  return {
    awaitingYou: views.filter((v) => v.battle.status !== 'finished' && v.awaitingMe),
    awaitingOpponent: views.filter((v) => v.battle.status !== 'finished' && !v.awaitingMe),
    finished: views.filter((v) => v.battle.status === 'finished'),
  };
}

export interface BattlePage {
  battle: BattleRow;
  me: FighterRow;
  opponent: FighterRow;
  side: 'a' | 'b';
  logs: RoundLogRow[];
  /** Whether your submission for the current round is already in. */
  submitted: boolean;
}

export async function loadBattlePage(id: string, fighter: FighterRow): Promise<BattlePage> {
  const { data, error } = await supabase.from('battles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('no such battle, or not yours to watch');
  const battle = data as BattleRow;

  const side = battle.fighter_a === fighter.id ? 'a' : 'b';
  const opponentId = side === 'a' ? battle.fighter_b : battle.fighter_a;
  const { data: opponent, error: opponentError } = await supabase
    .from('fighters')
    .select('*')
    .eq('id', opponentId)
    .maybeSingle();
  if (opponentError) throw new Error(opponentError.message);
  if (!opponent) throw new Error('your opponent has vanished');

  const { data: logs, error: logError } = await supabase
    .from('round_logs')
    .select('*')
    .eq('battle_id', battle.id)
    .order('round_no', { ascending: true });
  if (logError) throw new Error(logError.message);

  const { data: mine } = await supabase
    .from('submissions')
    .select('fighter_id')
    .eq('battle_id', battle.id)
    .eq('round_no', battle.round_no)
    .eq('fighter_id', fighter.id)
    .maybeSingle();

  return {
    battle,
    me: fighter,
    opponent: opponent as FighterRow,
    side,
    logs: (logs ?? []) as RoundLogRow[],
    submitted: Boolean(mine),
  };
}
