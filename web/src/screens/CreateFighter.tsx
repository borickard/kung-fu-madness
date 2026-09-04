import { MOVES, STARTING_FIGHTER, STARTING_MOVE_IDS } from 'engine';
import { useState } from 'react';
import { MoveTable } from '../components/MoveTable.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Field } from '../components/ui/Field.tsx';
import { Notice, Panel } from '../components/ui/Panel.tsx';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

const ATTRIBUTES: [string, number][] = [
  ['HP', STARTING_FIGHTER.hp_max],
  ['Energy', STARTING_FIGHTER.energy_max],
  ['Strength', STARTING_FIGHTER.strength],
  ['Accuracy', STARTING_FIGHTER.accuracy],
  ['Evasion', STARTING_FIGHTER.evasion],
  ['Toughness', STARTING_FIGHTER.toughness],
];

export function CreateFighter() {
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createFighter(name.trim());
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'that did not work');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-12">
      <h1 className="text-[20px]">Create your fighter</h1>
      <p className="text-muted text-[13px]">
        One fighter per account, white belt, no possessions. Everything else is earned.
      </p>

      <Panel title="Name">
        <form onSubmit={submit} className="space-y-3 p-3">
          <Field
            label="Fighter name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={24}
            hint="Two to twenty-four characters. It is permanent, so choose with care."
          />
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <Button type="submit" variant="primary" disabled={busy || name.trim().length < 2}>
            Step onto the mat
          </Button>
        </form>
      </Panel>

      <Panel title="Starting attributes" aside="fixed">
        <table>
          <tbody>
            {ATTRIBUTES.map(([label, value]) => (
              <tr key={label}>
                <td className="text-[13px]">{label}</td>
                <td className="num text-right">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Moves you start with">
        <MoveTable moves={MOVES.filter((m) => STARTING_MOVE_IDS.includes(m.id))} />
      </Panel>
    </div>
  );
}
