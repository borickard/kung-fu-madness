import {
  ATTACKS_PER_ROUND,
  BLOCKS_PER_ROUND,
  ENERGY_REGEN,
  MOVES,
  ROUND_CAP,
  type Attack,
  type LogEvent,
  type Move,
  type Zone,
} from 'engine';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HpBar } from '../components/HpBar.tsx';
import { MoveTable } from '../components/MoveTable.tsx';
import { ZoneGrid, countZones } from '../components/ZoneGrid.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Empty, Notice, Panel } from '../components/ui/Panel.tsx';
import { api } from '../lib/api.ts';
import { loadBattlePage } from '../lib/battles.ts';
import type { RoundLogRow } from '../lib/database.types.ts';
import { ZONE_LABEL, belt, outcomeLine, timeLeft } from '../lib/format.ts';
import { renderEvent } from '../lib/log.ts';
import { useSession } from '../lib/session.tsx';
import { useLive } from '../lib/useLive.ts';

interface Slot {
  move: Move | null;
  zone: Zone | null;
}

const EMPTY_SLOTS: Slot[] = Array.from({ length: ATTACKS_PER_ROUND }, () => ({
  move: null,
  zone: null,
}));

export function Battle({ onChange }: { onChange: () => void }) {
  const { id } = useParams<{ id: string }>();
  const { fighter, ownedMoveIds } = useSession();

  const page = useLive(
    async () => (id && fighter ? loadBattlePage(id, fighter) : null),
    [id, fighter?.id],
    15_000,
  );

  const [attacks, setAttacks] = useState<Slot[]>(EMPTY_SLOTS);
  const [blocks, setBlocks] = useState<(Zone | null)[]>(Array(BLOCKS_PER_ROUND).fill(null));
  const [move, setMove] = useState<Move | null>(MOVES[0] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (page.error) return <Notice tone="bad">{page.error}</Notice>;
  if (!page.data) return <Empty>Loading the battle…</Empty>;

  const { battle, me, opponent, side, logs, submitted } = page.data;
  const names = side === 'a' ? { a: me.name, b: opponent.name } : { a: opponent.name, b: me.name };
  const myHp = side === 'a' ? battle.hp_a : battle.hp_b;
  const theirHp = side === 'a' ? battle.hp_b : battle.hp_a;
  const myEnergy = side === 'a' ? battle.energy_a : battle.energy_b;
  const energyThisRound = Math.min(me.energy_max, myEnergy + ENERGY_REGEN);
  const energySpend = attacks.reduce((total, slot) => total + (slot.move?.eng ?? 0), 0);

  const filledAttacks = attacks.filter((slot) => slot.move && slot.zone).length;
  const filledBlocks = blocks.filter(Boolean).length;
  const ready = filledAttacks === ATTACKS_PER_ROUND && filledBlocks === BLOCKS_PER_ROUND;

  function placeAttack(zone: Zone) {
    if (!move) return;
    setAttacks((current) => {
      const next = [...current];
      const slot = next.findIndex((entry) => !entry.move || !entry.zone);
      if (slot === -1) return current;
      next[slot] = { move, zone };
      return next;
    });
  }

  function clearAttack(index: number) {
    setAttacks((current) => current.map((slot, i) => (i === index ? { move: null, zone: null } : slot)));
  }

  function placeBlock(zone: Zone) {
    setBlocks((current) => {
      const next = [...current];
      const slot = next.findIndex((entry) => entry === null);
      if (slot === -1) return current;
      next[slot] = zone;
      return next;
    });
  }

  function clearBlock(index: number) {
    setBlocks((current) => current.map((zone, i) => (i === index ? null : zone)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload: Attack[] = attacks.flatMap((slot) =>
        slot.move && slot.zone ? [{ move_id: slot.move.id, zone: slot.zone }] : [],
      );
      await api.submitRound(battle.id, payload, blocks.filter((zone): zone is Zone => zone !== null));
      setAttacks(EMPTY_SLOTS);
      setBlocks(Array(BLOCKS_PER_ROUND).fill(null));
      page.reload();
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'that did not work');
    } finally {
      setBusy(false);
    }
  }

  const winnerName =
    battle.winner_id === me.id ? me.name : battle.winner_id === opponent.id ? opponent.name : null;

  return (
    <div className="space-y-4">
      <Panel
        title={`Round ${battle.round_no} of ${ROUND_CAP}`}
        aside={battle.status === 'active' ? `${timeLeft(battle.deadline_at)} left` : battle.status}
      >
        <div className="grid gap-4 p-3 sm:grid-cols-2">
          <HpBar hp={myHp} hpMax={me.hp_max} name={`${me.name} (you)`} />
          <HpBar hp={theirHp} hpMax={opponent.hp_max} name={`${opponent.name} · ${belt(opponent.belt)}`} />
        </div>
        {battle.status === 'finished' ? (
          <p className="border-rule border-t px-3 py-2 text-[13px]">
            {outcomeLine(battle.outcome, winnerName)}.{' '}
            <Link className="text-accent underline" to="/arena">
              Find another opponent
            </Link>
          </p>
        ) : null}
      </Panel>

      {battle.status === 'active' && !submitted ? (
        <Panel title="Commit your round" aside={`${energySpend}/${energyThisRound} energy`}>
          <div className="grid gap-4 p-3 lg:grid-cols-2">
            <div className="space-y-3">
              <Slots
                label="Attacks"
                rows={attacks.map((slot, index) => ({
                  key: index,
                  filled: Boolean(slot.move && slot.zone),
                  text: slot.move && slot.zone ? `${slot.move.name} → ${ZONE_LABEL[slot.zone]}` : 'empty',
                  onClear: () => clearAttack(index),
                }))}
              />
              <ZoneGrid
                legend={
                  move
                    ? `Pick a target for ${move.name}. Zones describe your opponent.`
                    : 'Choose a move first.'
                }
                counts={countZones(attacks.map((slot) => slot.zone))}
                onPick={placeAttack}
                disabled={!move || filledAttacks === ATTACKS_PER_ROUND}
              />
            </div>

            <div className="space-y-3">
              <Slots
                label="Blocks"
                rows={blocks.map((zone, index) => ({
                  key: index,
                  filled: Boolean(zone),
                  text: zone ? ZONE_LABEL[zone] : 'empty',
                  onClear: () => clearBlock(index),
                }))}
              />
              <ZoneGrid
                legend="Guard three zones. Two on one zone mitigates more; three, a little more."
                counts={countZones(blocks)}
                onPick={placeBlock}
                disabled={filledBlocks === BLOCKS_PER_ROUND}
              />
            </div>
          </div>

          <div className="border-rule border-t">
            <MoveTable moves={MOVES} selected={move?.id ?? null} onSelect={setMove} owned={ownedMoveIds} />
          </div>

          <div className="border-rule flex flex-wrap items-center justify-between gap-3 border-t p-3">
            <p className="text-muted text-[12px]">
              Submitting is irreversible. You cannot see your opponent's round, and they cannot see
              yours.
              {energySpend > energyThisRound
                ? ' At that energy the last attack will fizzle.'
                : ''}
            </p>
            <Button variant="primary" disabled={!ready || busy} onClick={() => void submit()}>
              Commit {ATTACKS_PER_ROUND} attacks and {BLOCKS_PER_ROUND} blocks
            </Button>
          </div>
          {error ? (
            <div className="p-3 pt-0">
              <Notice tone="bad">{error}</Notice>
            </div>
          ) : null}
        </Panel>
      ) : battle.status === 'active' ? (
        <Panel title="Committed">
          <Empty>
            Your round is in. Nothing more to do until {opponent.name} commits theirs — or the
            deadline sweeps them.
          </Empty>
        </Panel>
      ) : null}

      <Panel title="Round log" aside={`${logs.length} resolved`}>
        {logs.length === 0 ? (
          <Empty>Nothing has happened yet.</Empty>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            {logs.map((log) => (
              <RoundEntry key={log.round_no} log={log} names={names} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Slots({
  label,
  rows,
}: {
  label: string;
  rows: { key: number; filled: boolean; text: string; onClear: () => void }[];
}) {
  return (
    <div>
      <p className="text-muted mb-2 text-[11px] tracking-[0.08em] uppercase">{label}</p>
      <ol className="border-rule border-t">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="border-rule flex items-center justify-between border-b px-3 py-2 text-[13px]"
          >
            <span className={row.filled ? '' : 'text-muted'}>
              <span className="num text-muted mr-2">{index + 1}</span>
              {row.text}
            </span>
            {row.filled ? (
              <button
                type="button"
                onClick={row.onClear}
                className="text-muted hover:text-accent text-[12px]"
                aria-label={`Clear ${label.toLowerCase()} ${index + 1}`}
              >
                clear
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoundEntry({ log, names }: { log: RoundLogRow; names: { a: string; b: string } }) {
  const events = (log.events ?? []) as unknown as LogEvent[];
  return (
    <div className="border-rule border-b last:border-b-0">
      <div className="bg-ground text-muted flex items-baseline justify-between px-3 py-1.5 text-[11px] tracking-[0.08em] uppercase">
        <span>Round {log.round_no}</span>
        <span className="num">
          {names.a} {log.hp_a_after} · {names.b} {log.hp_b_after}
        </span>
      </div>
      <ul className="px-3 py-2">
        {events.map((event, index) => (
          <li key={index} className="num text-[13px] leading-6">
            {renderEvent(event, names)}
          </li>
        ))}
      </ul>
    </div>
  );
}
