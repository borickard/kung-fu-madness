import {
  ATTRIBUTE_CAP,
  ATTRIBUTE_KEYS,
  MOVES,
  attributeCost,
  xpBalance,
  type AttributeKey,
} from 'engine';
import { useState } from 'react';
import { Button } from '../components/ui/Button.tsx';
import { Notice, Panel } from '../components/ui/Panel.tsx';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

export function PowerUp() {
  const { fighter, ownedMoveIds, refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!fighter) return null;

  const attributes: Record<AttributeKey, number> = {
    strength: fighter.strength,
    accuracy: fighter.accuracy,
    evasion: fighter.evasion,
    toughness: fighter.toughness,
  };
  const balance = xpBalance(fighter.xp, attributes, ownedMoveIds);

  async function buy(key: string, run: () => Promise<{ spent: number }>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const result = await run();
      await refresh();
      setNote(`Spent ${result.spent} XP.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'that did not work');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="XP to spend" aside={`${fighter.xp} earned`}>
        <p className="num p-3 text-[20px]">{balance}</p>
      </Panel>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {note ? <Notice>{note}</Notice> : null}

      <Panel title="Attributes" aside={`cap ${ATTRIBUTE_CAP}`}>
        <table>
          <thead>
            <tr>
              <th>Attribute</th>
              <th className="text-right">Level</th>
              <th className="text-right">Next level</th>
              <th className="text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {ATTRIBUTE_KEYS.map((key) => {
              const level = attributes[key];
              const cost = attributeCost(level + 1);
              const capped = level >= ATTRIBUTE_CAP;
              return (
                <tr key={key}>
                  <td className="text-[13px] capitalize">{key}</td>
                  <td className="num text-right">{level}</td>
                  <td className="num text-right">{capped ? '—' : cost}</td>
                  <td className="text-right">
                    <Button
                      disabled={capped || balance < cost || busy === key}
                      onClick={() => void buy(key, () => api.buyAttribute(key))}
                    >
                      {capped ? 'At cap' : 'Buy'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel title="Moves">
        <table>
          <thead>
            <tr>
              <th>Move</th>
              <th className="text-right">H%</th>
              <th className="text-right">Spd</th>
              <th className="text-right">Avg</th>
              <th className="text-right">C%</th>
              <th className="text-right">Cx</th>
              <th className="text-right">Eng</th>
              <th className="text-right">XP</th>
              <th className="text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {MOVES.map((move) => {
              const owned = ownedMoveIds.includes(move.id);
              return (
                <tr key={move.id} className={owned ? 'text-muted' : ''}>
                  <td className="text-[13px]">{move.name}</td>
                  <td className="num text-right">{move.hit_pct}</td>
                  <td className="num text-right">{move.spd}</td>
                  <td className="num text-right">{move.avg_dmg}</td>
                  <td className="num text-right">{move.crit_pct}</td>
                  <td className="num text-right">{move.crit_mult.toFixed(1)}</td>
                  <td className="num text-right">{move.eng}</td>
                  <td className="num text-right">{move.xp_cost}</td>
                  <td className="text-right">
                    {owned ? (
                      <span className="text-[13px]">Owned</span>
                    ) : (
                      <Button
                        disabled={balance < move.xp_cost || busy === `move-${move.id}`}
                        onClick={() => void buy(`move-${move.id}`, () => api.buyMove(move.id))}
                      >
                        Buy
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
