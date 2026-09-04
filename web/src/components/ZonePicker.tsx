import { ZONES, type Zone } from 'engine';
import { ZONE_LABEL } from '../lib/format.ts';

/** High, mid or low. One of three, which is the whole game. */
export function ZonePicker({
  value,
  onPick,
  label,
  tone = 'attack',
  disabled = false,
}: {
  value: Zone | null;
  onPick: (zone: Zone) => void;
  label: string;
  tone?: 'attack' | 'block';
  disabled?: boolean;
}) {
  return (
    <div>
      <span className="sr-only">{label}</span>
      <div className="border-rule flex border-t border-l">
        {ZONES.map((zone) => {
          const chosen = value === zone;
          return (
            <button
              key={zone}
              type="button"
              disabled={disabled}
              aria-pressed={chosen}
              onClick={() => onPick(zone)}
              className={`border-rule flex-1 border-r border-b px-2 py-2 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                chosen
                  ? tone === 'attack'
                    ? 'bg-accent text-white'
                    : 'bg-ink text-ground'
                  : 'bg-panel hover:bg-ground'
              }`}
            >
              {ZONE_LABEL[zone]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
