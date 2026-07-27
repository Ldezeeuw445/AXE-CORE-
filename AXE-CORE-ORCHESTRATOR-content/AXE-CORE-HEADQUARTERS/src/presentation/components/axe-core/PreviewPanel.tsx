import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Eye, Play, Square, RefreshCw, X } from 'lucide-react';
import { previewStart, previewStop, previewStatus, type PreviewStatus } from '@/infrastructure/gateways/axeCoreApiService';

/**
 * Live preview panel for the Code Editor — starts a real dev-server process
 * on the VPS (POST /preview/start) and iframes it once nginx's /preview
 * route is live. Until that VPS step is done, this is still fully honest:
 * it shows the real server log instead of a blank/fake preview.
 */
export function PreviewPanel({ isMobile, onClose }: { isMobile: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<PreviewStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    try { setStatus(await previewStatus()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => {
    void refreshStatus();
    pollRef.current = setInterval(() => void refreshStatus(), 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refreshStatus]);

  const handleStart = async () => {
    setBusy(true); setError('');
    try { await previewStart(); await refreshStatus(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const handleStop = async () => {
    setBusy(true);
    try { await previewStop(); await refreshStatus(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const running = status?.running ?? false;
  const url = status?.url ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={`flex flex-col overflow-hidden ${isMobile ? 'absolute inset-0 z-30' : 'flex-shrink-0'}`}
      style={{ width: isMobile ? '100%' : 380, borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}
    >
      <div className="px-3 py-2 flex items-center gap-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Eye size={10} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>PREVIEW</span>
        {running ? (
          <button onClick={() => void handleStop()} disabled={busy} title="Stop preview server"
            className="p-1 rounded disabled:opacity-40" style={{ color: '#f87171' }}><Square size={10} /></button>
        ) : (
          <button onClick={() => void handleStart()} disabled={busy} title="Start preview server (npm run dev)"
            className="p-1 rounded disabled:opacity-40" style={{ color: 'var(--success)' }}><Play size={10} /></button>
        )}
        {running && url && (
          <button onClick={() => setIframeKey(k => k + 1)} title="Reload" className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}><RefreshCw size={10} /></button>
        )}
        <button onClick={onClose} className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.3)' }}><X size={10} /></button>
      </div>

      {running && url ? (
        <iframe key={iframeKey} src={url} className="flex-1 w-full" style={{ border: 'none', background: '#fff' }} title="Live preview" />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {error && <div style={{ color: '#f87171' }}>{error}</div>}
          {!running && <div>Nog geen dev-server actief. Klik ▶ om de dev-server te starten in de workspace.</div>}
          {running && !url && (
            <div style={{ color: '#f59e0b' }}>
              Server draait op poort {status?.port}, maar de nginx /preview-route staat nog niet klaar op de VPS. Zodra die er is, verschijnt de live preview hier automatisch — zie de VPS-checklist.
            </div>
          )}
          {status && status.log.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Server-log</div>
              <pre className="whitespace-pre-wrap text-[9px] p-2 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', maxHeight: 260, overflowY: 'auto' }}>
                {status.log.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
