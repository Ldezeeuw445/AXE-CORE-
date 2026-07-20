import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/core/supabase/client';
import { hydrateSettingsFromSupabase } from '@/services/platform/userSettingsService';
import { useVoiceStore } from '@/store/voiceStore';

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

    // Get initial session
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        void hydrateAccountState();
      }
    });

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
