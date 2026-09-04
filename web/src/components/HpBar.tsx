import { percent } from '../lib/format.ts';

export function HpBar({
  hp,
  hpMax,
  name,
  compact = false,
}: {
  hp: number;
  hpMax: number;
  name?: string;
  compact?: boolean;
}) {
  const left = percent(hp, hpMax);
  return (
    <div className={compact ? '' : 'space-y-1'}>
      {name ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px]">{name}</span>
          <span className="num text-muted">
            {Math.max(0, hp)}/{hpMax}
          </span>
        </div>
      ) : null}
      <div className="border-rule h-2 border bg-transparent">
        <div
          className={left > 25 ? 'h-full bg-ink' : 'h-full bg-accent'}
          style={{ width: `${left}%` }}
        />
      </div>
    </div>
  );
}
