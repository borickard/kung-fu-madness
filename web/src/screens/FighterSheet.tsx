import { ATTRIBUTE_KEYS, MOVES, beltName, xpBalance, xpToNextBelt } from 'engine';
import { useParams } from 'react-router-dom';
import { MoveTable } from '../components/MoveTable.tsx';
import { Empty, Notice, Panel } from '../components/ui/Panel.tsx';
import type { FighterMoveRow, FighterRow } from '../lib/database.types.ts';
import { record } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';
import { supabase } from '../lib/supabase.ts';
import { useLive } from '../lib/useLive.ts';

export function FighterSheet() {
  const { id } = useParams<{ id: string }>();
  const { fighter: mine } = useSession();
  const targetId = id ?? mine?.id;

  const sheet = useLive(
    async () => {
      if (!targetId) return null;
      const { data, error } = await supabase
        .from('fighters')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('no such fighter');

      const { data: moves } = await supabase
        .from('fighter_moves')
        .select('move_id, hidden')
        .eq('fighter_id', targetId);

      return {
        fighter: data as FighterRow,
        ownedMoveIds: ((moves ?? []) as FighterMoveRow[]).map((row) => row.move_id),
      };
    },
    [targetId],
    0,
  );

  if (sheet.error) return <Notice tone="bad">{sheet.error}</Notice>;
  if (!sheet.data) return <Empty>Loading…</Empty>;

  const { fighter, ownedMoveIds } = sheet.data;
  const isMine = fighter.id === mine?.id;
  const attributes = {
    strength: fighter.strength,
    accuracy: fighter.accuracy,
    evasion: fighter.evasion,
    toughness: fighter.toughness,
  };
  const balance = xpBalance(fighter.xp, attributes, ownedMoveIds);
  const next = xpToNextBelt(fighter.xp);

  return (
    <div className="space-y-4">
      <Panel title={fighter.name} aside={beltName(fighter.belt)}>
        <table>
          <tbody>
            <tr>
              <td className="text-[13px]">Record (W–L–D)</td>
              <td className="num text-right">{record(fighter)}</td>
            </tr>
            <tr>
              <td className="text-[13px]">Cumulative XP</td>
              <td className="num text-right">{fighter.xp}</td>
            </tr>
            {isMine ? (
              <tr>
                <td className="text-[13px]">XP left to spend</td>
                <td className="num text-accent text-right">{balance}</td>
              </tr>
            ) : null}
            <tr>
              <td className="text-[13px]">Next belt</td>
              <td className="num text-right">
                {next ? `${beltName(next.belt)} in ${next.needed} XP` : 'the top of the ladder'}
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Attributes">
        <table>
          <tbody>
            <tr>
              <td className="text-[13px]">Max HP</td>
              <td className="num text-right">{fighter.hp_max}</td>
            </tr>
            <tr>
              <td className="text-[13px]">Max energy</td>
              <td className="num text-right">{fighter.energy_max}</td>
            </tr>
            {ATTRIBUTE_KEYS.map((key) => (
              <tr key={key}>
                <td className="text-[13px] capitalize">{key}</td>
                <td className="num text-right">{attributes[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Moves" aside={`${ownedMoveIds.length} of ${MOVES.length}`}>
        <MoveTable moves={MOVES.filter((move) => ownedMoveIds.includes(move.id))} />
      </Panel>
    </div>
  );
}
