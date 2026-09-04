import { Route, Routes } from 'react-router-dom';
import { Nav } from './components/Nav.tsx';
import { groupBattles, loadBattleViews } from './lib/battles.ts';
import { useSession } from './lib/session.tsx';
import { useLive } from './lib/useLive.ts';
import { Arena } from './screens/Arena.tsx';
import { Battle } from './screens/Battle.tsx';
import { CreateFighter } from './screens/CreateFighter.tsx';
import { CurrentBattles } from './screens/CurrentBattles.tsx';
import { FighterSheet } from './screens/FighterSheet.tsx';
import { PowerUp } from './screens/PowerUp.tsx';
import { Rankings } from './screens/Rankings.tsx';
import { SignIn } from './screens/SignIn.tsx';

export function App() {
  const { session, fighter, loading } = useSession();

  const views = useLive(
    async () => (fighter ? loadBattleViews(fighter) : []),
    [fighter?.id],
    30_000,
  );

  if (loading) {
    return <p className="text-muted mx-auto max-w-5xl px-4 py-16 text-center">Loading…</p>;
  }
  if (!session) return <SignIn />;
  if (!fighter) return <CreateFighter />;

  const groups = groupBattles(views.data ?? []);

  return (
    <div className="min-h-screen">
      <Nav awaiting={groups.awaitingYou.length} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<CurrentBattles groups={groups} reload={views.reload} />} />
          <Route path="/arena" element={<Arena onChallenge={views.reload} />} />
          <Route path="/battle/:id" element={<Battle onChange={views.reload} />} />
          <Route path="/fighter" element={<FighterSheet />} />
          <Route path="/fighter/:id" element={<FighterSheet />} />
          <Route path="/power-up" element={<PowerUp />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="*" element={<p className="text-muted">Nothing here.</p>} />
        </Routes>
      </main>
      <footer className="text-muted mx-auto max-w-5xl px-4 pb-10 text-[12px]">
        A remake of Kung Fu Madness, 2000–2009. Rounds resolve on the server.
      </footer>
    </div>
  );
}
