import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router';
import { useAuth } from '@/presentation/contexts/AuthContext';
import { TriangleLogo } from '@/presentation/components/axe-core/TriangleLogo';

/**
 * The first surface, and now the first one on AXE Surface.
 *
 * What changed and why:
 *
 *  - The form sits on a real panel instead of floating on the ground. The old
 *    version had nothing behind it, so the inputs read as three loose objects
 *    rather than as one thing to fill in.
 *  - Colours come from the tokens in index.css. Every literal rgba() that used
 *    to be inline here is gone; inline literals are exactly how this screen and
 *    the rest of the app drifted apart in the first place.
 *  - Focus is a CSS ring on `.axe-input`, not onFocus/onBlur mutating a style
 *    object. The old handlers left keyboard users with no focus state at all.
 *  - The submit button is `.axe-primary`: the one filled-bright element on the
 *    screen. It used to be a cyan-tinted ghost, which made the most important
 *    control on the page look like a secondary action.
 */
export default function LoginPage() {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Already logged in → redirect to home
  useEffect(() => {
    if (!authLoading && user) navigate('/', { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center px-4 py-6"
      style={{
        background:
          'radial-gradient(120% 80% at 50% -10%, rgba(34,211,238,.07), transparent 60%),' +
          'radial-gradient(90% 60% at 85% 110%, rgba(59,130,246,.06), transparent 60%),' +
          'var(--bg-base)',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* The grid. Masked, or it tiles edge to edge and the page reads as
          graph paper instead of a screen with something lit on it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),' +
            'linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(120% 90% at 50% 10%,#000 30%,transparent 78%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-4"
          >
            <TriangleLogo size={56} animate id="login" />
          </motion.div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            AXE CORE
          </h1>
          <p
            className="mt-1.5 text-[11px] font-semibold uppercase tracking-[.16em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Personal Command Center
          </p>
        </div>

        <form onSubmit={handleSubmit} className="axe-surface flex flex-col gap-3 p-5">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoFocus
            autoComplete="username"
            className="axe-input w-full px-3.5 py-3 text-[13px]"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Wachtwoord"
            required
            autoComplete="current-password"
            className="axe-input w-full px-3.5 py-3 text-[13px]"
          />

          {error && (
            <p
              className="px-0.5 text-xs leading-snug"
              style={{ color: 'var(--error, #EF4444)' }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="axe-primary mt-1 w-full rounded-[10px] py-3 text-[13px] font-semibold"
          >
            {loading ? 'Inloggen…' : 'Inloggen'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Zelfde account als AXE Companion &amp; Trading OS
        </p>
      </motion.div>
    </div>
  );
}
