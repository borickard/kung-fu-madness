import type { Zone } from 'engine';
import { ZONE_GRID, ZONE_LABEL } from '../lib/format.ts';

export function ZoneGrid({
  counts,
  onPick,
  disabled = false,
  legend,
}: {
  counts: Record<Zone, number>;
  onPick: (zone: Zone) => void;
  disabled?: boolean;
  legend: string;
}) {
  return (
    <div>
      <p className="text-muted mb-2 text-[12px]">{legend}</p>
      <div className="border-rule grid grid-cols-2 border-t border-l">
        {ZONE_GRID.flat().map((zone) => {
          const count = counts[zone];
          return (
            <button
              key={zone}
              type="button"
              disabled={disabled}
              onClick={() => onPick(zone)}
              className={`border-rule flex h-16 items-center justify-between border-r border-b px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                count > 0 ? 'bg-accent-soft' : 'bg-panel hover:bg-ground'
              }`}
            >
              <span className="text-[13px]">{ZONE_LABEL[zone]}</span>
              <span className="num text-accent" aria-hidden>
                {count > 0 ? '•'.repeat(count) : ''}
              </span>
              <span className="sr-only">{count} selected</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function emptyCounts(): Record<Zone, number> {
  return {
    HIGH_LEFT: 0,
    HIGH_RIGHT: 0,
    MID_LEFT: 0,
    MID_RIGHT: 0,
    LOW_LEFT: 0,
    LOW_RIGHT: 0,
  };
}

export function countZones(zones: (Zone | null)[]): Record<Zone, number> {
  const counts = emptyCounts();
  for (const zone of zones) if (zone) counts[zone] += 1;
  return counts;
}
