import { NavLink } from 'react-router-dom';
import { belt } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';
import { Ink } from './Ink.tsx';

const LINKS: { to: string; label: string }[] = [
  { to: '/', label: 'Current battles' },
  { to: '/arena', label: 'Arena' },
  { to: '/fighter', label: 'Fighter' },
  { to: '/power-up', label: 'Power up' },
  { to: '/rankings', label: 'Rankings' },
];

export function Nav({ awaiting }: { awaiting: number }) {
  const { fighter, signOut } = useSession();

  return (
    <header className="border-rule bg-panel border-b">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Ink className="text-ink h-7 w-7 shrink-0 opacity-90" />
        <div className="mr-auto">
          <h1 className="text-[17px] leading-tight">Kung Fu Madness</h1>
          <p className="text-muted text-[11px] tracking-[0.08em] uppercase">
            Three attacks, three blocks, one round at a time
          </p>
        </div>
        {fighter ? (
          <div className="text-right">
            <div className="text-[13px]">{fighter.name}</div>
            <div className="num text-muted text-[12px]">
              {belt(fighter.belt)} · {fighter.xp} XP
            </div>
          </div>
        ) : null}
        <button onClick={() => void signOut()} className="text-muted hover:text-ink text-[12px] underline">
          Sign out
        </button>
      </div>

      <nav className="border-rule mx-auto flex max-w-5xl gap-1 border-t px-4">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-[13px] ${
                isActive ? 'border-accent text-ink' : 'text-muted hover:text-ink border-transparent'
              }`
            }
          >
            {link.label}
            {link.to === '/' && awaiting > 0 ? (
              <span className="num bg-accent ml-2 px-1.5 py-0.5 text-[11px] text-white">
                {awaiting}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
