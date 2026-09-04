import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { FighterMoveRow, FighterRow } from './database.types.ts';
import { supabase } from './supabase.ts';

interface SessionValue {
  session: Session | null;
  fighter: FighterRow | null;
  ownedMoveIds: number[];
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [fighter, setFighter] = useState<FighterRow | null>(null);
  const [ownedMoveIds, setOwnedMoveIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFighter = useCallback(async (current: Session | null) => {
    if (!current) {
      setFighter(null);
      setOwnedMoveIds([]);
      return;
    }
    const { data } = await supabase
      .from('fighters')
      .select('*')
      .eq('user_id', current.user.id)
      .maybeSingle();
    setFighter((data as FighterRow | null) ?? null);

    if (data) {
      const { data: moves } = await supabase
        .from('fighter_moves')
        .select('move_id')
        .eq('fighter_id', (data as FighterRow).id);
      setOwnedMoveIds(((moves ?? []) as FighterMoveRow[]).map((row) => row.move_id));
    } else {
      setOwnedMoveIds([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadFighter(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadFighter(next);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadFighter]);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      fighter,
      ownedMoveIds,
      loading,
      refresh: () => loadFighter(session),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw new Error(error.message);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, fighter, ownedMoveIds, loading, loadFighter],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}
