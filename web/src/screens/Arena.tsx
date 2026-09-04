import { ARENA_BELT_SPREAD } from 'engine';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.tsx';
import { Empty, Notice, Panel } from '../components/ui/Panel.tsx';
import { api } from '../lib/api.ts';
import type { FighterRow } from '../lib/database.types.ts';
import { belt, record } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';
import { supabase } from '../lib/supabase.ts';
import { useLive } from '../lib/useLive.ts';

export function Arena({ onChallenge }: { onChallenge: () => void }) {
  const { fighter, refresh } = useSession();
  const [wide, setWide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  const listed = useLive(
    async () => {
      let query = supabase
        .from('fighters')
        .select('*')
        .eq('is_listed_in_arena', true)
        .order('belt', { ascending: false })
        .order('xp', { ascending: false })
        .limit(100);

      if (!wide && fighter) {
        query = query
          .gte('belt', fighter.belt - ARENA_BELT_SPREAD)
          .lte('belt', fighter.belt + ARENA_BELT_SPREAD);
      }
      const { data, error: queryError } = await query;
      if (queryError) throw new Error(queryError.message);
      return (data ?? []).filter((f) => f.id !== fighter?.id) as FighterRow[];
    },
    [wide, fighter?.id, fighter?.belt],
    60_000,
  );

  async function toggleListing() {
    if (!fighter) return;
    const { error: updateError } = await supabase
      .from('fighters')
      .update({ is_listed_in_arena: !fighter.is_listed_in_arena })
      .eq('id', fighter.id);
    if (updateError) setError(updateError.message);
    else await refresh();
  }

  async function challenge(opponent: FighterRow) {
    setBusy(opponent.id);
    setError(null);
    try {
      await api.challenge(opponent.id);
      setSent((current) => [...current, opponent.id]);
      onChallenge();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'that did not work');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Notice tone="bad">{error}</Notice> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant={wide ? 'quiet' : 'primary'} onClick={() => setWide(false)}>
            Within one belt
          </Button>
          <Button variant={wide ? 'primary' : 'quiet'} onClick={() => setWide(true)}>
            Every belt
          </Button>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={fighter?.is_listed_in_arena ?? false}
            onChange={() => void toggleListing()}
          />
          List me as available
        </label>
      </div>

      <Panel title="Fighters available" aside={`${listed.data?.length ?? 0}`}>
        {listed.loading ? (
          <Empty>Looking…</Empty>
        ) : (listed.data?.length ?? 0) === 0 ? (
          <Empty>Nobody at this belt is listed. Try widening the filter.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fighter</th>
                <th>Belt</th>
                <th className="text-right">XP</th>
                <th className="text-right">Record</th>
                <th className="text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {(listed.data ?? []).map((opponent) => (
                <tr key={opponent.id}>
                  <td className="text-[13px]">
                    <Link
                      className="hover:text-accent underline-offset-2 hover:underline"
                      to={`/fighter/${opponent.id}`}
                    >
                      {opponent.name}
                    </Link>
                  </td>
                  <td className="text-muted text-[13px]">{belt(opponent.belt)}</td>
                  <td className="num text-right">{opponent.xp}</td>
                  <td className="num text-right">{record(opponent)}</td>
                  <td className="text-right">
                    {sent.includes(opponent.id) ? (
                      <span className="text-muted text-[13px]">Challenge sent</span>
                    ) : (
                      <Button
                        disabled={busy === opponent.id}
                        onClick={() => void challenge(opponent)}
                      >
                        Challenge
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
