import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Eye, Play, Square, RefreshCw, X, MousePointer2, Type, Layers } from 'lucide-react';
import { previewStart, previewStop, previewStatus, type PreviewStatus } from '@/infrastructure/gateways/axeCoreApiService';
import { designAgentBridge } from '@/presentation/components/axe-core/designAgentBridge';

/**
 * Design-mode bridge injected into the preview iframe (same-origin only).
 * Click to select · drag to reorder siblings · postMessage back to parent.
 */
const DESIGN_BRIDGE = `
(function () {
  if (window.__AXE_DESIGN__) return;
  window.__AXE_DESIGN__ = true;
  var selected = null;
  var dragEl = null;

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      var part = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(part + '#' + el.id); break; }
      var parent = el.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === el.tagName; });
        if (siblings.length > 1) part += ':nth-of-type(' + (Array.prototype.indexOf.call(siblings, el) + 1) + ')';
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(' > ');
  }

  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    var cs = window.getComputedStyle(el);
    var r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className: (typeof el.className === 'string' ? el.className : '') || '',
      text: (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) ? (el.textContent || '').trim().slice(0, 400) : '',
      path: cssPath(el),
      outerHTML: el.outerHTML.slice(0, 1200),
      styles: {
        display: cs.display,
        flexDirection: cs.flexDirection,
        gap: cs.gap,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        padding: cs.padding,
        margin: cs.margin,
        width: Math.round(r.width) + 'px',
        height: Math.round(r.height) + 'px',
      },
    };
  }

  function clearOutline() {
    if (selected) selected.style.outline = selected.__axeOutline || '';
    selected = null;
  }

  function select(el) {
    if (!el || el === document.body || el === document.documentElement) return;
    clearOutline();
    selected = el;
    el.__axeOutline = el.style.outline;
    el.style.outline = '2px solid #22d3ee';
    el.style.outlineOffset = '2px';
    window.parent.postMessage({ type: 'axe-design-select', payload: describe(el) }, '*');
  }

  document.addEventListener('click', function (e) {
    if (!window.__AXE_DESIGN_ON__) return;
    e.preventDefault();
    e.stopPropagation();
    select(e.target);
  }, true);

  document.addEventListener('dragstart', function (e) {
    if (!window.__AXE_DESIGN_ON__) return;
    dragEl = e.target;
    try { e.dataTransfer.setData('text/plain', 'axe-move'); } catch (_) {}
    e.dataTransfer.effectAllowed = 'move';
  }, true);

  document.addEventListener('dragover', function (e) {
    if (!window.__AXE_DESIGN_ON__ || !dragEl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, true);

  document.addEventListener('drop', function (e) {
    if (!window.__AXE_DESIGN_ON__ || !dragEl) return;
    e.preventDefault();
    var target = e.target;
    if (!target || target === dragEl) return;
    var parent = target.parentElement;
    if (parent && dragEl.parentElement === parent) {
      parent.insertBefore(dragEl, target);
      select(dragEl);
      window.parent.postMessage({ type: 'axe-design-moved', payload: describe(dragEl) }, '*');
    }
    dragEl = null;
  }, true);

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'axe-design-toggle') {
      window.__AXE_DESIGN_ON__ = !!data.on;
      if (!data.on) clearOutline();
      document.body.style.cursor = data.on ? 'crosshair' : '';
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        try { all[i].draggable = !!data.on; } catch (_) {}
      }
    }
    if (data.type === 'axe-design-apply' && selected) {
      var p = data.payload || {};
      if (typeof p.text === 'string' && selected.childNodes.length === 1 && selected.childNodes[0].nodeType === 3) {
        selected.textContent = p.text;
      }
      if (p.className != null) selected.className = p.className;
      if (p.styles) {
        Object.keys(p.styles).forEach(function (k) {
          if (p.styles[k] != null && p.styles[k] !== '') selected.style[k] = p.styles[k];
        });
      }
      window.parent.postMessage({ type: 'axe-design-select', payload: describe(selected) }, '*');
    }
  });

  window.parent.postMessage({ type: 'axe-design-ready' }, '*');
})();
`;

export type DesignSelection = {
  tag: string;
  id: string;
  className: string;
  text: string;
  path: string;
  outerHTML: string;
  styles: Record<string, string>;
};

export function PreviewPanel({
  isMobile,
  onClose,
  onSendToAgent,
}: {
  isMobile: boolean;
  onClose: () => void;
  /** Optional: push a design change instruction into the Code Agent */
  onSendToAgent?: (instruction: string) => void;
}) {
  const [status, setStatus] = useState<PreviewStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const [designMode, setDesignMode] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [selection, setSelection] = useState<DesignSelection | null>(null);
  const [editText, setEditText] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editFontSize, setEditFontSize] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editBg, setEditBg] = useState('');
  const [agentHint, setAgentHint] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  const injectBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) {
        setBridgeReady(false);
        return;
      }
      const s = doc.createElement('script');
      s.textContent = DESIGN_BRIDGE;
      doc.documentElement.appendChild(s);
      setBridgeReady(true);
      iframe.contentWindow?.postMessage({ type: 'axe-design-toggle', on: designMode }, '*');
    } catch {
      setBridgeReady(false);
    }
  }, [designMode]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; payload?: DesignSelection };
      if (!data || typeof data !== 'object') return;
      if (data.type === 'axe-design-ready') setBridgeReady(true);
      if (data.type === 'axe-design-select' || data.type === 'axe-design-moved') {
        const p = data.payload;
        if (p) {
          setSelection(p);
          setEditText(p.text || '');
          setEditClass(p.className || '');
          setEditFontSize(p.styles?.fontSize || '');
          setEditColor(p.styles?.color || '');
          setEditBg(p.styles?.backgroundColor || '');
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'axe-design-toggle', on: designMode }, '*');
    if (!designMode) setSelection(null);
  }, [designMode]);

  const applySelection = () => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'axe-design-apply',
      payload: {
        text: editText,
        className: editClass,
        styles: {
          fontSize: editFontSize,
          color: editColor,
          backgroundColor: editBg,
        },
      },
    }, '*');
  };

  const sendToAgent = () => {
    if (!selection) return;
    const instruction = [
      'Update the UI to match this design-mode edit in the live preview.',
      `Selected element: <${selection.tag}> path: ${selection.path}`,
      selection.id ? `id="${selection.id}"` : '',
      `classes: ${editClass || selection.className}`,
      editText ? `text content should be: ${JSON.stringify(editText)}` : '',
      `styles: fontSize=${editFontSize || selection.styles.fontSize}, color=${editColor || selection.styles.color}, background=${editBg || selection.styles.backgroundColor}`,
      'HTML snapshot:',
      selection.outerHTML.slice(0, 800),
      'Apply the equivalent change in the React/source component (not only the live DOM).',
    ].filter(Boolean).join('\n');

    if (onSendToAgent) {
      onSendToAgent(instruction);
      setAgentHint('Verstuurd naar Code Agent');
      return;
    }
    if (designAgentBridge.send(instruction)) {
      setAgentHint('Verstuurd via designAgentBridge');
      return;
    }
    setAgentHint('Code Agent nog niet gekoppeld — open Agent panel (registreer bridge in CodeEditorPage)');
  };

  const handleStart = async () => {
    setBusy(true); setError('');
    try { await previewStart(); await refreshStatus(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const handleStop = async () => {
    setBusy(true);
    try { await previewStop(); await refreshStatus(); setDesignMode(false); setSelection(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const running = status?.running ?? false;
  const url = status?.url ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={`flex flex-col overflow-hidden ${isMobile ? 'absolute inset-0 z-30' : 'flex-shrink-0'}`}
      style={{ width: isMobile ? '100%' : designMode ? 420 : 380, borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}
    >
      <div className="px-3 py-2 flex items-center gap-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Eye size={10} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>PREVIEW</span>
        {running && url && (
          <button
            onClick={() => setDesignMode(v => !v)}
            title="Design Mode — click elements, drag to reorder, edit styles"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]"
            style={{
              background: designMode ? 'rgba(34,211,238,0.15)' : 'transparent',
              border: designMode ? '1px solid rgba(34,211,238,0.35)' : '1px solid transparent',
              color: designMode ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)',
            }}
          >
            <MousePointer2 size={10} /> Design
          </button>
        )}
        {running ? (
          <button onClick={() => void handleStop()} disabled={busy} title="Stop preview server"
            className="p-1 rounded disabled:opacity-40" style={{ color: '#f87171' }}><Square size={10} /></button>
        ) : (
          <button onClick={() => void handleStart()} disabled={busy} title="Start preview server (npm run dev)"
            className="p-1 rounded disabled:opacity-40" style={{ color: 'var(--success)' }}><Play size={10} /></button>
        )}
        {running && url && (
          <button onClick={() => { setIframeKey(k => k + 1); setBridgeReady(false); setSelection(null); }}
            title="Reload" className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}><RefreshCw size={10} /></button>
        )}
        <button onClick={onClose} className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.3)' }}><X size={10} /></button>
      </div>

      {running && url ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 relative">
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={url}
              className="w-full h-full"
              style={{ border: 'none', background: '#fff' }}
              title="Live preview"
              onLoad={() => injectBridge()}
            />
            {designMode && (
              <div className="absolute top-1 left-1 right-1 flex items-center gap-1 px-2 py-0.5 rounded text-[8px] pointer-events-none"
                style={{ background: 'rgba(3,9,11,0.85)', color: 'rgba(165,243,252,0.9)', border: '1px solid rgba(34,211,238,0.25)' }}>
                <Layers size={9} />
                {bridgeReady
                  ? 'Design Mode · klik om te selecteren · sleep om te herordenen'
                  : 'Cross-origin preview — design inject geblokkeerd (zelfde origin nodig via /preview proxy)'}
              </div>
            )}
          </div>

          {designMode && selection && (
            <div className="flex-shrink-0 p-2 space-y-1.5 overflow-y-auto" style={{ maxHeight: 240, borderTop: '1px solid rgba(255,255,255,0.06)', background: '#03090b' }}>
              <div className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--accent-cyan)' }}>
                <Type size={10} />
                <span className="font-mono truncate"><{selection.tag}> {selection.path}</span>
              </div>
              <label className="block text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Text</label>
              <input value={editText} onChange={e => setEditText(e.target.value)}
                className="w-full text-[10px] px-2 py-1 rounded outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }} />
              <label className="block text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Classes</label>
              <input value={editClass} onChange={e => setEditClass(e.target.value)}
                className="w-full text-[10px] px-2 py-1 rounded outline-none font-mono"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }} />
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <label className="block text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Font</label>
                  <input value={editFontSize} onChange={e => setEditFontSize(e.target.value)} placeholder="16px"
                    className="w-full text-[9px] px-1 py-1 rounded outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }} />
                </div>
                <div>
                  <label className="block text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Color</label>
                  <input value={editColor} onChange={e => setEditColor(e.target.value)} placeholder="#fff"
                    className="w-full text-[9px] px-1 py-1 rounded outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }} />
                </div>
                <div>
                  <label className="block text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>BG</label>
                  <input value={editBg} onChange={e => setEditBg(e.target.value)} placeholder="transparent"
                    className="w-full text-[9px] px-1 py-1 rounded outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }} />
                </div>
              </div>
              <div className="flex gap-1 pt-1">
                <button onClick={applySelection}
                  className="flex-1 px-2 py-1 rounded text-[9px] font-medium"
                  style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.25)' }}>
                  Apply in preview
                </button>
                <button onClick={sendToAgent}
                  className="flex-1 px-2 py-1 rounded text-[9px] font-medium"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                  → Code Agent
                </button>
              </div>
              {agentHint && <p className="text-[8px]" style={{ color: 'rgba(16,185,129,0.8)' }}>{agentHint}</p>}
              <p className="text-[8px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.22)' }}>
                Live DOM edits verdwijnen bij reload. “→ Code Agent” past de echte source aan via de agent.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {error && <div style={{ color: '#f87171' }}>{error}</div>}
          {!running && <div>Nog geen dev-server actief. Klik ▶ om de dev-server te starten in de workspace.</div>}
          {running && !url && (
            <div style={{ color: '#f59e0b' }}>
              Server draait op poort {status?.port}, maar PREVIEW_PUBLIC_URL / nginx /preview staat nog niet klaar op de VPS.
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
