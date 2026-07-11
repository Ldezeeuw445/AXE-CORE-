import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabaseClient';
import { hydrateSettingsFromSupabase } from '@/services/userSettingsService';
import { useVoiceStore } from '@/store/voiceStore';

const TEST_USER: User = {
  id: 'test-user-axe-core',
  email: 'test@axe-core.dev',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: { name: 'Test User' },
  identities: [],
  factors: [],
  phone: '',
  updated_at: new Date().toISOString(),
} as User;

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  testMode: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null, session: null, loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  testMode: false,
});

const TEST_MODE_KEY = 'axe_test_mode';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    let alive = true;

    // Check for test mode first
    const isTestMode = localStorage.getItem(TEST_MODE_KEY) === '1';
    if (isTestMode) {
      setTestMode(true);
      setUser(TEST_USER);
      setLoading(false);
      return () => { alive = false; };
    }

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
    // Clear test mode on sign out
    localStorage.removeItem(TEST_MODE_KEY);
    setTestMode(false);
    setUser(null);
    const sb = getSupabase();
    await sb?.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, testMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
