import { Link } from 'react-router-dom';
import { Empty, Notice, Panel } from '../components/ui/Panel.tsx';
import type { FighterRow } from '../lib/database.types.ts';
import { belt, record } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';
import { supabase } from '../lib/supabase.ts';
import { useLive } from '../lib/useLive.ts';

export function Rankings() {
  const { fighter } = useSession();
  const rows = useLive(
    async () => {
      const { data, error } = await supabase.from('rankings').select('*').limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as FighterRow[];
    },
    [],
    120_000,
  );

  if (rows.error) return <Notice tone="bad">{rows.error}</Notice>;

  return (
    <Panel title="Rankings" aside="belt, then XP">
      {(rows.data?.length ?? 0) === 0 ? (
        <Empty>Nobody has stepped on the mat yet.</Empty>
      ) : (
        <table>
          <thead>
            <tr>
              <th className="w-10 text-right">#</th>
              <th>Fighter</th>
              <th>Belt</th>
              <th className="text-right">XP</th>
              <th className="text-right">Record</th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((row, index) => (
              <tr key={row.id} className={row.id === fighter?.id ? 'bg-accent-soft' : ''}>
                <td className="num text-right">{index + 1}</td>
                <td className="text-[13px]">
                  <Link className="hover:text-accent underline-offset-2 hover:underline" to={`/fighter/${row.id}`}>
                    {row.name}
                  </Link>
                </td>
                <td className="text-muted text-[13px]">{belt(row.belt)}</td>
                <td className="num text-right">{row.xp}</td>
                <td className="num text-right">{record(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
