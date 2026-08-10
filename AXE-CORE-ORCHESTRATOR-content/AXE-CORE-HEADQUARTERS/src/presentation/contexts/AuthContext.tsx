import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { hydrateSettingsFromSupabase } from '@/infrastructure/persistence/userSettingsService';
import { useVoiceStore } from '@/presentation/store/voiceStore';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, session: null, loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }

    const hydrateAccountState = async () => {
      await hydrateSettingsFromSupabase().catch(() => {});
      if (!alive) return;
      await useVoiceStore.getState().refreshConfiguration().catch(() => {});
    };

    // Get initial session.
    //
    // `loading` gates the entire app (App.tsx renders null while it is true),
    // so anything that leaves it stuck turns the whole product into a black
    // screen. This had no error branch at all: when Supabase was unreachable
    // — DNS failure, paused project, offline laptop — the promise rejected,
    // setLoading(false) never ran, and AXE showed nothing at all with no clue
    // why. Being signed out is a state the app can render; being stuck is not.
    let settled = false;
    const settle = () => { settled = true; setLoading(false); };

    sb.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        settle();
        if (data.session?.user) {
          void hydrateAccountState();
        }
      })
      .catch((err) => {
        if (!alive) return;
        console.error('[auth] getSession failed — continuing signed out:', err);
        settle();
      });

    // A rejection is not the only way to hang: a request that never settles
    // leaves the same black screen, and the SDK applies no timeout of its own.
    const failsafe = window.setTimeout(() => {
      if (!alive || settled) return;
      console.error('[auth] getSession did not settle in 8s — continuing signed out');
      settle();
    }, 8000);

    // Listen for auth changes (login/logout from other tabs/apps)
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      // Hydrate settings from Supabase when user logs in
      if (session?.user) {
        void hydrateAccountState();
      }
    });

    return () => {
      alive = false;
      window.clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { error: 'Supabase not configured' };
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    const sb = getSupabase();
    await sb?.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
