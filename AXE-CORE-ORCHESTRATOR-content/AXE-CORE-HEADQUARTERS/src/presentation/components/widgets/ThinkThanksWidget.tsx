/**
 * Compact THINKTHANKS drop zone for the left Tools drawer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Lightbulb, Link2, Loader2, Upload } from 'lucide-react';
import {
  addFilesToThinkThanks,
  addTextOrLinkToThinkThanks,
  listThinkThanksItems,
  listAppGrowth,
  type ThinkThanksItem,
} from '@/infrastructure/persistence/thinkThanksService';

export function ThinkThanksWidget() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [items, setItems] = useState<ThinkThanksItem[]>([]);
  const [grown, setGrown] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(listThinkThanksItems().slice(0, 4));
    try { setGrown(listAppGrowth().length); } catch { setGrown(0); }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('axe-thinkthanks-changed', onChange);
    return () => window.removeEventListener('axe-thinkthanks-changed', onChange);
  }, [refresh]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || (files as FileList).length === 0) return;
    setBusy(true);
    try {
      const created = await addFilesToThinkThanks(files);
      flash(`${created.length} item(s) dropped — analysing…`);
      refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Drop failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePasteOrSubmit = async () => {
    const v = linkValue.trim();
    if (!v) return;
    setBusy(true);
    try {
      await addTextOrLinkToThinkThanks(v);
      setLinkValue('');
      flash('Captured — analysing…');
      refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri && /^https?:\/\//i.test(uri.trim()) && (!e.dataTransfer.files || e.dataTransfer.files.length === 0)) {
      setBusy(true);
      void addTextOrLinkToThinkThanks(uri.trim())
        .then(() => { flash('Link captured — analysing…'); refresh(); })
        .catch(err => flash(err instanceof Error ? err.message : 'Failed'))
        .finally(() => setBusy(false));
      return;
    }
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 py-3 px-2"
        style={{
          minHeight: 88,
          border: dragging ? '1px dashed var(--tint-line)' : '1px dashed rgba(255,255,255,0.12)',
          background: dragging ? 'var(--tint)' : 'rgba(255,255,255,0.02)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="*/*"
          className="hidden"
          onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }}
        />
        {busy ? (
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
        ) : (
          <Upload size={16} style={{ color: dragging ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
        )}
        <span className="text-[10px] text-center leading-tight" style={{ color: 'var(--text-secondary)' }}>
          Drop anything — files, photos, videos, notes
        </span>
        <span className="text-[9px] text-center" style={{ color: 'var(--text-muted)' }}>
          or Instagram reels / links
        </span>
      </div>

      <div className="flex gap-1">
        <div className="flex-1 flex items-center gap-1 rounded-md px-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Link2 size={11} style={{ color: 'var(--text-muted)' }} />
          <input
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handlePasteOrSubmit(); } }}
            placeholder="Paste link / reel / note…"
            className="flex-1 bg-transparent text-[10px] outline-none py-1.5 min-w-0"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <button
          type="button"
          onClick={() => void handlePasteOrSubmit()}
          disabled={busy || !linkValue.trim()}
          className="px-2 rounded-md text-[10px] font-medium disabled:opacity-40"
          style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}
        >
          Add
        </button>
      </div>

      {toast && (
        <div className="text-[9px] font-mono" style={{ color: 'var(--accent-cyan)' }}>{toast}</div>
      )}

      {items.length > 0 && (
        <div className="space-y-1">
          {(grown > 0 || items.some(i => i.builtAt)) && (
            <div className="text-[10px] px-1 mb-1" style={{ color: 'rgba(34,211,238,0.75)' }}>
              {items.filter(i => i.builtAt).length} built · {items.filter(i => i.integratedAt).length} integrated · {grown} grown
            </div>
          )}
          {items.map(it => (
            <button
              key={it.id}
              type="button"
              onClick={() => navigate('/thinkthanks')}
              className="w-full text-left rounded-md px-1.5 py-1 flex items-center gap-1.5 hover:bg-white/5"
            >
              <Lightbulb size={10} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
              <span className="text-[10px] truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{it.name}</span>
              <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {it.analysisStatus === 'done' ? `${it.analysis?.overallUsefulness ?? '—'}%` : it.analysisStatus === 'analysing' ? '…' : '—'}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigate('/thinkthanks')}
            className="w-full text-[10px] py-1 rounded-md hover:bg-white/5"
            style={{ color: 'var(--accent-cyan)' }}
          >
            Open THINKTHANKS →
          </button>
        </div>
      )}
    </div>
  );
}
