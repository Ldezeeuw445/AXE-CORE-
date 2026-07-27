import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Bot, Send, Loader2, RefreshCw, MousePointerClick } from 'lucide-react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import type { KeySlot } from '@/domain/providers';
import {
  browserAgentStart, browserAgentNavigate, browserAgentScreenshot, browserAgentClose,
} from '@/infrastructure/gateways/axeCoreApiService';
import { runBrowserAgentLoop, type BrowserAgentTurn } from '@/application/agents/browserAgentLoop';

interface LogEntry {
  role: 'user' | 'agent';
  text: string;
  action?: BrowserAgentTurn['action'];
  error?: string;
}

/**
 * Real browser agent — a genuine headless Chromium session the model
 * navigates/clicks/types in, shown here as a live screenshot ("kijkvenster"
 * on what's actually happening), separate from the manual tab/iframe
 * browsing elsewhere in the app. Honest 503 if Playwright isn't installed
 * on the VPS yet — no fabricated screenshots or fake page state.
 */
export function BrowserAgentPanel({ onClose }: { onClose: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [pageState, setPageState] = useState<{ url: string; title: string } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const screenshotUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (screenshotUrlRef.current) URL.revokeObjectURL(screenshotUrlRef.current);
    if (sessionId) void browserAgentClose(sessionId);
    abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    const { session_id } = await browserAgentStart();
    setSessionId(session_id);
    return session_id;
  }, [sessionId]);

  const refreshScreenshot = useCallback(async (sid: string) => {
    try {
      const blob = await browserAgentScreenshot(sid);
      const url = URL.createObjectURL(blob);
      if (screenshotUrlRef.current) URL.revokeObjectURL(screenshotUrlRef.current);
      screenshotUrlRef.current = url;
      setScreenshotUrl(url);
    } catch { /* screenshot is best-effort; a stale/missing one isn't fatal */ }
  }, []);

  const handleManualNavigate = async () => {
    if (!urlInput.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const sid = await ensureSession();
      const url = /^https?:\/\//i.test(urlInput.trim()) ? urlInput.trim() : `https://${urlInput.trim()}`;
      const state = await browserAgentNavigate(sid, url);
      setPageState(state);
      setLog(prev => [...prev, { role: 'agent', text: `Genavigeerd naar ${state.title || state.url}` }]);
      await refreshScreenshot(sid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    setInstruction('');
    setLog(prev => [...prev, { role: 'user', text }]);
    setBusy(true); setError('');

    const vs = useVoiceStore.getState();
    const slots = [vs.primarySlot, vs.fallback1Slot, vs.fallback2Slot, vs.fallback3Slot].filter((s): s is KeySlot => !!s?.key);
    if (slots.length === 0) {
      setLog(prev => [...prev, { role: 'agent', text: 'Nog geen AI-model geconfigureerd — ga naar Settings → Keys.' }]);
      setBusy(false);
      return;
    }

    try {
      const sid = await ensureSession();
      abortRef.current = new AbortController();
      await runBrowserAgentLoop(text, sid, slots, {
        signal: abortRef.current.signal,
        onTurn: turn => {
          setLog(prev => [...prev, {
            role: 'agent',
            text: turn.message || turn.reasoning,
            action: turn.action,
            error: turn.result?.error,
          }]);
          if (turn.result && !turn.result.error) setPageState({ url: turn.result.url, title: turn.result.title });
          void refreshScreenshot(sid);
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLog(prev => [...prev, { role: 'agent', text: `Fout: ${msg}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col" style={{ background: '#050505' }}>
      <div className="px-3 py-2 flex items-center gap-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <MousePointerClick size={12} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>BROWSER AGENT — echte Playwright-sessie</span>
        {pageState && (
          <span className="text-[9px] truncate max-w-[240px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{pageState.title || pageState.url}</span>
        )}
        <button onClick={onClose} className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}><X size={12} /></button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Kijkvenster — live screenshot of what the agent is actually seeing */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: '#0a0a0a' }}>
          <div className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleManualNavigate(); }}
              placeholder="URL — bv. wikipedia.org"
              className="flex-1 text-[10px] px-2 py-1 rounded outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <button onClick={() => void handleManualNavigate()} disabled={busy} className="px-2 py-1 rounded disabled:opacity-40" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
              <Send size={10} />
            </button>
            {sessionId && (
              <button onClick={() => void refreshScreenshot(sessionId)} title="Ververs screenshot" className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <RefreshCw size={11} />
              </button>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center overflow-auto p-2">
            {screenshotUrl ? (
              <img src={screenshotUrl} alt="Live browser view" className="max-w-full max-h-full rounded" style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
            ) : (
              <div className="text-center space-y-2">
                <Bot size={28} style={{ margin: '0 auto', color: 'rgba(255,255,255,0.15)' }} />
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Nog geen sessie — navigeer naar een URL of geef AXE een opdracht
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat — natural-language instructions drive the real loop */}
        <div className="w-[300px] flex-shrink-0 flex flex-col" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {log.length === 0 && (
              <div className="text-[9px] text-center py-6" style={{ color: 'var(--text-muted)' }}>
                "zoek op wikipedia naar axe" — AXE navigeert, leest en klikt écht.
              </div>
            )}
            {log.map((entry, i) => (
              <div key={i} className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[92%] rounded px-2 py-1 text-[10px] leading-snug"
                  style={{
                    background: entry.role === 'user' ? 'rgba(34,211,238,0.12)' : entry.error ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                    color: entry.error ? '#f87171' : entry.role === 'user' ? 'rgba(255,255,255,0.85)' : 'rgba(165,243,252,0.85)',
                  }}
                >
                  {entry.action && entry.action.type !== 'done' && (
                    <div className="text-[8px] mb-0.5 opacity-60 font-mono">{entry.action.type}{entry.action.selector ? ` · ${entry.action.selector}` : ''}{entry.action.url ? ` · ${entry.action.url}` : ''}</div>
                  )}
                  {entry.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-1.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={9} className="animate-spin" /> AXE handelt…
              </div>
            )}
          </div>
          {error && <div className="px-2 py-1 text-[9px]" style={{ color: '#f87171' }}>{error}</div>}
          <div className="p-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex gap-1.5">
              <input
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSend(); }}
                placeholder="Geef AXE een opdracht…"
                className="flex-1 text-[10px] px-2 py-1.5 rounded outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <button onClick={() => void handleSend()} disabled={busy || !instruction.trim()} className="px-2 py-1.5 rounded disabled:opacity-40" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                <Send size={10} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
