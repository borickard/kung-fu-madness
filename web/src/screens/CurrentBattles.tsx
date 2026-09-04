import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HpBar } from '../components/HpBar.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Empty, Notice, Panel } from '../components/ui/Panel.tsx';
import { api } from '../lib/api.ts';
import type { BattleGroups, BattleView } from '../lib/battles.ts';
import { belt, outcomeLine, timeLeft } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';

export function CurrentBattles({ groups, reload }: { groups: BattleGroups; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error ? <Notice tone="bad">{error}</Notice> : null}

      <Panel title="Awaiting you" aside={`${groups.awaitingYou.length}`}>
        {groups.awaitingYou.length === 0 ? (
          <Empty>Nothing needs your attention. Go and pick a fight.</Empty>
        ) : (
          <BattleList views={groups.awaitingYou} reload={reload} onError={setError} />
        )}
      </Panel>

      <Panel title="Awaiting your opponent" aside={`${groups.awaitingOpponent.length}`}>
        {groups.awaitingOpponent.length === 0 ? (
          <Empty>No rounds are hanging.</Empty>
        ) : (
          <BattleList views={groups.awaitingOpponent} reload={reload} onError={setError} />
        )}
      </Panel>

      <Panel title="Finished" aside={`${groups.finished.length}`}>
        {groups.finished.length === 0 ? (
          <Empty>No battles behind you yet.</Empty>
        ) : (
          <BattleList views={groups.finished} reload={reload} onError={setError} />
        )}
      </Panel>
    </div>
  );
}

function BattleList({
  views,
  reload,
  onError,
}: {
  views: BattleView[];
  reload: () => void;
  onError: (message: string | null) => void;
}) {
  const { fighter } = useSession();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, run: () => Promise<unknown>) {
    setBusy(id);
    onError(null);
    try {
      await run();
      reload();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'that did not work');
    } finally {
      setBusy(null);
    }
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Opponent</th>
          <th>Belt</th>
          <th className="w-40">HP</th>
          <th className="text-right">Round</th>
          <th className="text-right">Time left</th>
          <th className="text-right">Status</th>
        </tr>
      </thead>
      <tbody>
        {views.map((view) => {
          const { battle, opponent } = view;
          const mineMax = fighter?.hp_max ?? 100;
          return (
            <tr key={battle.id}>
              <td className="text-[13px]">
                <Link className="hover:text-accent underline-offset-2 hover:underline" to={`/battle/${battle.id}`}>
                  {opponent.name}
                </Link>
              </td>
              <td className="text-muted text-[13px]">{belt(opponent.belt)}</td>
              <td>
                <div className="space-y-1">
                  <HpBar hp={view.hp.mine} hpMax={mineMax} compact />
                  <HpBar hp={view.hp.theirs} hpMax={opponent.hp_max} compact />
                </div>
              </td>
              <td className="num text-right">{battle.round_no}</td>
              <td className="num text-right">
                {battle.status === 'active' ? timeLeft(battle.deadline_at) : '—'}
              </td>
              <td className="text-right text-[13px]">
                {battle.status === 'pending' ? (
                  view.awaitingMe ? (
                    <span className="inline-flex gap-2">
                      <Button
                        variant="primary"
                        disabled={busy === battle.id}
                        onClick={() => void act(battle.id, () => api.accept(battle.id))}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy === battle.id}
                        onClick={() => void act(battle.id, () => api.decline(battle.id))}
                      >
                        Decline
                      </Button>
                    </span>
                  ) : (
                    <span className="text-muted">Challenge sent</span>
                  )
                ) : battle.status === 'finished' ? (
                  <span className="text-muted">
                    {outcomeLine(
                      battle.outcome,
                      battle.winner_id === fighter?.id
                        ? (fighter?.name ?? null)
                        : battle.winner_id
                          ? opponent.name
                          : null,
                    )}
                  </span>
                ) : view.awaitingMe ? (
                  <Link className="text-accent underline underline-offset-2" to={`/battle/${battle.id}`}>
                    Commit your round
                  </Link>
                ) : (
                  <span className="text-muted">Waiting</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
