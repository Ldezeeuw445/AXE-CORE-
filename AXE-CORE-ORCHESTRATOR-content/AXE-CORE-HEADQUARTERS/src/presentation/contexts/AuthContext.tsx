import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** Running on a stored session because the auth server could not be reached. */
  degraded: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null, session: null, loading: true, degraded: false,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});


/**
 * The session already on this machine, read before anything can throw it away.
 *
 * supabase-js refreshes an expired access token on boot. When that refresh
 * fails it treats the result as a sign-out: it clears its own storage and emits
 * SIGNED_OUT, and it does that identically whether the server said "this token
 * is revoked" or nobody answered at all.
 *
 * Measured 2026-08-19: GoTrue returned nothing for 20s while the stored session
 * here held a valid refresh token and an access token that had expired at
 * 16:27. So AXE showed a login screen that could not possibly succeed — the
 * thing that would have signed Luka in was the thing that was down.
 *
 * This is read at module load, before the client has had a chance to wipe it,
 * so a degraded session is still available afterwards.
 */
const PERSISTED_SESSION: Session | null = (() => {
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token'),
    );
    if (!key) return null;
    let raw = localStorage.getItem(key);
    if (!raw) return null;
    // supabase-js base64-prefixes the blob in newer versions.
    if (raw.startsWith('base64-')) raw = atob(raw.slice(7));
    const parsed = JSON.parse(raw) as Session;
    return parsed?.user ? parsed : null;
  } catch {
    return null;
  }
})();

/**
 * Is the auth server answering at all?
 *
 * The only question that matters when a refresh fails: "did it say no" or "was
 * nobody there". Deliberately short — this runs on a path where the user is
 * already waiting, and a slow answer counts as unreachable for our purposes.
 */
async function authReachable(): Promise<boolean> {
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  if (!base) return false;
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${base}/auth/v1/health`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
      signal: ctrl.signal,
    });
    window.clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start from the session already on this machine.
  //
  // Waiting for getSession() to answer first was a race that could only be lost
  // during an outage: with GoTrue not responding, that call hangs, the 8s
  // failsafe below resolves `loading` with no user, RequireAuth redirects to
  // /login — and any session restored a moment later arrives at a route that
  // renders the login form regardless. Seen exactly that way on 2026-08-19.
  //
  // Starting from the stored session removes the race instead of trying to win
  // it. If the server is up and disagrees, onAuthStateChange corrects this
  // within the same second and the login screen appears properly.
  const [user, setUser]       = useState<User | null>(PERSISTED_SESSION?.user ?? null);
  const [session, setSession] = useState<Session | null>(PERSISTED_SESSION);
  const [loading, setLoading] = useState(!PERSISTED_SESSION);
  const [degraded, setDegraded] = useState(false);
  // Only a sign-out Luka actually asked for should clear the session below.
  const explicitSignOut = useRef(false);

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
    let liveSession = false;
    const settle = () => { settled = true; setLoading(false); };

    sb.auth
      .getSession()
      .then(async ({ data }) => {
        if (!alive) return;
        if (data.session) {
          liveSession = true;
          setSession(data.session);
          setUser(data.session.user);
          setDegraded(false);
          settle();
          void hydrateAccountState();
          return;
        }
        // No live session. Before showing a login screen, find out whether
        // signing in is even possible right now.
        if (PERSISTED_SESSION && !(await authReachable())) {
          if (!alive) return;
          console.warn('[auth] auth server unreachable — continuing on the stored session');
          setSession(PERSISTED_SESSION);
          setUser(PERSISTED_SESSION.user);
          setDegraded(true);
          settle();
          return;
        }
        if (!alive) return;
        settle();
      })
      .catch((err) => {
        if (!alive) return;
        console.error('[auth] getSession failed — continuing signed out:', err);
        settle();
      });

    // Whether we are running on a live session or a stored one is not knowable
    // until either the server answers or we establish that it cannot. Until
    // then the banner stays off — it should mean "confirmed unreachable", not
    // "not sure yet".
    const confirmDegraded = window.setTimeout(() => {
      if (!alive || liveSession) return;
      if (!PERSISTED_SESSION) return;
      void authReachable().then((ok) => {
        if (alive && !liveSession) setDegraded(!ok);
      });
    }, 5000);

    // A rejection is not the only way to hang: a request that never settles
    // leaves the same black screen, and the SDK applies no timeout of its own.
    const failsafe = window.setTimeout(() => {
      if (!alive || settled) return;
      console.error('[auth] getSession did not settle in 8s — continuing signed out');
      settle();
    }, 8000);

    // Listen for auth changes (login/logout from other tabs/apps)
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) {
        liveSession = true;
        setSession(session);
        setUser(session.user);
        setDegraded(false);
        setLoading(false);
        void hydrateAccountState();
        return;
      }
      // session === null. That is a real sign-out only when Luka asked for one.
      // A failed token refresh lands here too, and treating the two the same is
      // what turned a Supabase outage into being locked out.
      if (explicitSignOut.current) {
        explicitSignOut.current = false;
        setSession(null);
        setUser(null);
        setDegraded(false);
        setLoading(false);
        return;
      }
      void (async () => {
        if (PERSISTED_SESSION && !(await authReachable())) {
          console.warn('[auth] refresh failed while the auth server is down — staying on the stored session');
          setSession(PERSISTED_SESSION);
          setUser(PERSISTED_SESSION.user);
          setDegraded(true);
          setLoading(false);
          return;
        }
        setSession(null);
        setUser(null);
        setDegraded(false);
        setLoading(false);
      })();
    });

    return () => {
      alive = false;
      window.clearTimeout(failsafe);
      window.clearTimeout(confirmDegraded);
      subscription.unsubscribe();
    };
  }, []);

  // Coming back.
  //
  // The seatbelt above had no release. Once running on a stored session,
  // nothing ever tried again: Supabase came back at 18:00 and the app kept the
  // warning up and kept failing every write with "TypeError: Load failed",
  // because the token it was holding had expired hours earlier and no one asked
  // for a new one. A fallback you cannot leave is its own kind of outage.
  //
  // So while degraded, ask periodically whether the server is answering, and
  // the moment it is, refresh for real. Success ends the degraded state through
  // the normal path; a refusal from a reachable server is a genuine sign-out.
  useEffect(() => {
    if (!degraded) return;
    let alive = true;

    const attempt = async () => {
      if (!alive) return;
      if (!(await authReachable())) return;
      const sb = getSupabase();
      if (!sb || !alive) return;
      const { data, error } = await sb.auth.refreshSession();
      if (!alive) return;
      if (data?.session) {
        console.info('[auth] Supabase answered again — session refreshed');
        setSession(data.session);
        setUser(data.session.user);
        setDegraded(false);
        return;
      }
      if (error) {
        // The server was reachable and still said no. That is a real sign-out,
        // and now it can be shown honestly instead of guessed at.
        console.warn('[auth] refresh refused by a reachable server — signing out:', error.message);
        setSession(null);
        setUser(null);
        setDegraded(false);
      }
    };

    void attempt();
    const timer = window.setInterval(() => { void attempt(); }, 20_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [degraded]);

  const signIn = async (email: string, password: string) => {
    const sb = getSupabase();
    if (!sb) return { error: 'Supabase not configured' };

    // Same failure shape as the boot-time getSession() above: a network path
    // that hangs instead of rejecting leaves signInWithPassword pending
    // forever, and the login button just says "Inloggen..." with no error —
    // indistinguishable from a wrong password until you notice it never ends.
    // A client-side timeout turns that silent hang into a message telling
    // Luka it's the connection, not his credentials.
    const timeout = new Promise<{ error: { message: string } }>((resolve) => {
      window.setTimeout(() => resolve({
        error: { message: 'Geen verbinding met Supabase (time-out na 10s) — dit is een netwerkprobleem, niet je wachtwoord. Probeer het nog eens.' },
      }), 10_000);
    });

    const { error } = await Promise.race([
      sb.auth.signInWithPassword({ email, password }),
      timeout,
    ]);
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    const sb = getSupabase();
    explicitSignOut.current = true;
    // Clear the fallback too, or the next boot would restore what was just
    // signed out of.
    try {
      const key = Object.keys(localStorage).find(
        (k) => k.startsWith('sb-') && k.endsWith('-auth-token'),
      );
      if (key) localStorage.removeItem(key);
    } catch { /* storage unavailable — signOut below still applies */ }
    await sb?.auth.signOut();
    setSession(null);
    setUser(null);
    setDegraded(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, degraded, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
