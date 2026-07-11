import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { TriangleLogo } from '@/components/axe-core/TriangleLogo';
import { FlaskConical } from 'lucide-react';

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
        background: 'radial-gradient(circle at top, rgba(34,211,238,0.08) 0%, rgba(0,0,0,1) 55%)',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm px-2 sm:px-6"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-4"
          >
            <TriangleLogo size={64} animate id="login" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>AXE CORE</h1>
          <p className="text-xs mt-1 max-w-[22rem]" style={{ color: 'var(--text-muted)' }}>AI Operating System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-primary)',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(34,211,238,0.4)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Wachtwoord"
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-primary)',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(34,211,238,0.4)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>

          {error && (
            <p className="text-xs px-1 leading-snug" style={{ color: 'var(--error, #f87171)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: loading ? 'rgba(34,211,238,0.15)' : 'rgba(34,211,238,0.12)',
              border: '1px solid rgba(34,211,238,0.3)',
              color: 'var(--accent-cyan)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Inloggen...' : 'Inloggen'}
          </button>
        </form>

        {/* Test Mode Login */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => {
              localStorage.setItem('axe_test_mode', '1');
              window.location.href = '/';
            }}
            className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              color: '#F59E0B',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)'; }}
          >
            <FlaskConical size={14} />
            Test User Login
          </button>
          <p className="text-center text-[10px] mt-1.5" style={{ color: 'rgba(245,158,11,0.5)' }}>
            Direct toegang — geen account nodig
          </p>
        </div>

        <p className="text-center text-xs mt-4 px-2" style={{ color: 'var(--text-muted)' }}>
          Zelfde account als AXE Companion & Trading OS
        </p>
      </motion.div>
    </div>
  );
}
