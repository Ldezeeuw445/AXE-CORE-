import { Navigate } from 'react-router';
import { useAuth } from '@/app/providers/AuthContext';
import { ADMIN_EMAILS } from '@/app/config/access';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!ADMIN_EMAILS.includes(user.email ?? '')) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0A0A10', color: '#EF4444', fontFamily: 'JetBrains Mono, monospace', gap: 12 }}>
        <span style={{ fontSize: 48 }}>⛔</span>
        <span style={{ fontSize: 14 }}>ACCESS DENIED</span>
        <span style={{ fontSize: 11, color: '#6B7280' }}>AXE CORE is a private admin system.</span>
        <button onClick={() => { const sb = (window as never as { supabase?: { auth: { signOut: () => void } } }).supabase; sb?.auth.signOut(); window.location.href = '/login'; }} style={{ marginTop: 8, fontSize: 11, color: '#6B7280', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Sign out</button>
      </div>
    );
  }
  return <>{children}</>;
}
