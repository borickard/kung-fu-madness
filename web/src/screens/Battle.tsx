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
import { BotTag } from '../components/BotTag.tsx';
import { HpBar } from '../components/HpBar.tsx';
import { MoveTable } from '../components/MoveTable.tsx';
import { ZonePicker } from '../components/ZonePicker.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Empty, Notice, Panel } from '../components/ui/Panel.tsx';
import { api } from '../lib/api.ts';
import { loadBattlePage } from '../lib/battles.ts';
import type { RoundLogRow } from '../lib/database.types.ts';
import { belt, outcomeLine, timeLeft } from '../lib/format.ts';
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

  function setMove(index: number, move_id: number) {
    const chosen = MOVES.find((entry) => entry.id === move_id) ?? null;
    setAttacks((current) => current.map((slot, i) => (i === index ? { ...slot, move: chosen } : slot)));
  }

  function setZone(index: number, zone: Zone) {
    setAttacks((current) => current.map((slot, i) => (i === index ? { ...slot, zone } : slot)));
  }

  function setBlock(index: number, zone: Zone) {
    setBlocks((current) => current.map((entry, i) => (i === index ? zone : entry)));
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
          <div>
            <HpBar
              hp={theirHp}
              hpMax={opponent.hp_max}
              name={`${opponent.name} · ${belt(opponent.belt)}`}
            />
            {opponent.is_bot ? <BotTag /> : null}
            {opponent.is_bot ? (
              <p className="text-muted mt-1 text-[12px]">
                A practice bot. It answers the moment you commit, and it pays no XP after the
                first win of the day.
              </p>
            ) : null}
          </div>
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
          <p className="text-muted border-rule border-b px-3 py-2 text-[12px]">
            Three exchanges. In each one your attack meets their block for that same
            exchange, and their attack meets yours. Guess the zone and the whole blow
            is stopped; guess wrong and all of it lands.
          </p>

          <div className="border-rule divide-rule divide-y">
            {attacks.map((slot, index) => (
              <div key={index} className="grid gap-3 p-3 sm:grid-cols-[auto_1fr_1fr]">
                <div className="num text-muted pt-2 text-[13px]">{index + 1}</div>

                <div className="space-y-2">
                  <label className="text-muted block text-[11px] tracking-[0.08em] uppercase">
                    You attack
                  </label>
                  <select
                    className="border-rule bg-panel w-full border px-2 py-1.5 text-[13px]"
                    value={slot.move?.id ?? ''}
                    onChange={(event) => setMove(index, Number(event.target.value))}
                  >
                    <option value="">choose a move</option>
                    {MOVES.filter((move) => ownedMoveIds.includes(move.id)).map((move) => (
                      <option key={move.id} value={move.id}>
                        {move.name} · {move.avg_dmg} dmg · spd {move.spd} · {move.eng} eng
                      </option>
                    ))}
                  </select>
                  <ZonePicker
                    label={`Attack zone for exchange ${index + 1}`}
                    value={slot.zone}
                    onPick={(zone) => setZone(index, zone)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-muted block text-[11px] tracking-[0.08em] uppercase">
                    You block
                  </label>
                  <p className="text-muted text-[12px]">
                    Stops their attack {index + 1}, and nothing else.
                  </p>
                  <ZonePicker
                    label={`Block zone for exchange ${index + 1}`}
                    tone="block"
                    value={blocks[index] ?? null}
                    onPick={(zone) => setBlock(index, zone)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="border-rule border-t">
            <MoveTable moves={MOVES} owned={ownedMoveIds} />
          </div>

          <div className="border-rule flex flex-wrap items-center justify-between gap-3 border-t p-3">
            <p className="text-muted text-[12px]">
              Submitting is irreversible. You cannot see their round, and they cannot see
              yours.
              {energySpend > energyThisRound ? ' At that energy the last attack will fizzle.' : ''}
            </p>
            <Button variant="primary" disabled={!ready || busy} onClick={() => void submit()}>
              Commit the round
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
