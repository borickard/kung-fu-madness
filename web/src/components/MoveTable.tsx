import type { Move } from 'engine';

/**
 * The attack filter screen from the original, column names and all:
 * H%, Spd, Avg, Range, C%, Cx, Eng.
 */
export function MoveTable({
  moves,
  selected,
  onSelect,
  owned,
}: {
  moves: readonly Move[];
  selected?: number | null;
  onSelect?: (move: Move) => void;
  owned?: readonly number[];
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Move</th>
          <th className="text-right">H%</th>
          <th className="text-right">Spd</th>
          <th className="text-right">Avg</th>
          <th className="text-right">Range</th>
          <th className="text-right">C%</th>
          <th className="text-right">Cx</th>
          <th className="text-right">Eng</th>
        </tr>
      </thead>
      <tbody>
        {moves.map((move) => {
          const locked = owned ? !owned.includes(move.id) : false;
          const isSelected = selected === move.id;
          return (
            <tr
              key={move.id}
              onClick={() => (!locked && onSelect ? onSelect(move) : undefined)}
              className={`${onSelect && !locked ? 'cursor-pointer' : ''} ${
                isSelected ? 'bg-accent-soft' : ''
              } ${locked ? 'opacity-45' : ''}`}
            >
              <td className="text-[13px]">
                {onSelect ? (
                  <span className="text-accent mr-2 inline-block w-3" aria-hidden>
                    {isSelected ? '›' : ''}
                  </span>
                ) : null}
                {move.name}
                {locked ? <span className="text-muted"> (locked)</span> : null}
              </td>
              <td className="num text-right">{move.hit_pct}</td>
              <td className="num text-right">{move.spd}</td>
              <td className="num text-right">{move.avg_dmg}</td>
              <td className="num text-right">{move.range}</td>
              <td className="num text-right">{move.crit_pct}</td>
              <td className="num text-right">{move.crit_mult.toFixed(1)}</td>
              <td className="num text-right">{move.eng}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
