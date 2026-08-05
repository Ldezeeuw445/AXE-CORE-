/**
 * THINKTHANKS full page — drop inbox + app-fit scores + BUILD composer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check, FileText, Film, Image as ImageIcon, Lightbulb, Link2, Loader2,
  Music, StickyNote, Trash2, Upload, Instagram, Sparkles,
} from 'lucide-react';
import {
  TARGET_APPS,
  addFilesToThinkThanks,
  addTextOrLinkToThinkThanks,
  analyseThinkThanksItem,
  buildThinkThanksItem,
  deleteThinkThanksItem,
  listThinkThanksItems,
  usefulnessColor,
  usefulnessLabel,
  type TargetApp,
  type ThinkThanksItem,
} from '@/infrastructure/persistence/thinkThanksService';

function KindIcon({ kind }: { kind: ThinkThanksItem['kind'] }) {
  const props = { size: 16 as const, style: { color: 'var(--accent-cyan)' } };
  switch (kind) {
    case 'image': return <ImageIcon {...props} />;
    case 'video': return <Film {...props} />;
    case 'audio': return <Music {...props} />;
    case 'link': return <Link2 {...props} />;
    case 'note': return <StickyNote {...props} />;
    case 'instagram-reel': return <Instagram {...props} />;
    default: return <FileText {...props} />;
  }
}

export default function ThinkThanksPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ThinkThanksItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [composer, setComposer] = useState('');
  const [selectedApps, setSelectedApps] = useState<TargetApp[]>([]);
  const [building, setBuilding] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'built'>('all');

  const refresh = useCallback(() => setItems(listThinkThanksItems()), []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('axe-thinkthanks-changed', onChange);
    return () => window.removeEventListener('axe-thinkthanks-changed', onChange);
  }, [refresh]);

  const selected = useMemo(
    () => items.find(i => i.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    if (!selected?.analysis?.fits?.length) return;
    const top = selected.analysis.fits.filter(f => f.percent >= 45).map(f => f.app);
    setSelectedApps(top.length ? top : [selected.analysis.fits[0].app]);
    setComposer('');
  }, [selected?.id]);

  const visible = useMemo(() => {
    if (filter === 'built') return items.filter(i => !!i.builtAt);
    if (filter === 'pending') return items.filter(i => !i.builtAt);
    return items;
  }, [items, filter]);

  const ingestFiles = async (files: FileList | File[] | null) => {
    if (!files || !(files as FileList).length) return;
    setBusy(true);
    try {
      const created = await addFilesToThinkThanks(files);
      if (created[0]) setSelectedId(created[0].id);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const ingestText = async () => {
    const v = paste.trim();
    if (!v) return;
    setBusy(true);
    try {
      const item = await addTextOrLinkToThinkThanks(v);
      setPaste('');
      setSelectedId(item.id);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri && /^https?:\/\//i.test(uri.trim()) && !e.dataTransfer.files?.length) {
      setBusy(true);
      void addTextOrLinkToThinkThanks(uri.trim())
        .then(item => { setSelectedId(item.id); refresh(); })
        .finally(() => setBusy(false));
      return;
    }
    if (e.dataTransfer.files?.length) void ingestFiles(e.dataTransfer.files);
  };

  const toggleApp = (app: TargetApp) => {
    setSelectedApps(prev => (prev.includes(app) ? prev.filter(a => a !== app) : [...prev, app]));
  };

  const onBuild = async () => {
    if (!selected || !selectedApps.length) return;
    setBuilding(true);
    try {
      await buildThinkThanksItem(selected.id, { apps: selectedApps, composerContext: composer });
      refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <motion.div className="h-full flex flex-col overflow-hidden" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>THINKTHANKS</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Drop anything — files, photos, videos, links, notes, Instagram reels. Auto-scored for AXE Core, Companion, AXON Memory & Trading OS. BUILD integrates into the apps you choose.
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="lg:w-[340px] flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/5 min-h-0">
          <div className="p-3 space-y-2 flex-shrink-0">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 py-6"
              style={{
                border: dragging ? '1px dashed rgba(34,211,238,0.6)' : '1px dashed rgba(255,255,255,0.12)',
                background: dragging ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)',
              }}
            >
              <input ref={fileRef} type="file" multiple accept="*/*" className="hidden" onChange={e => { void ingestFiles(e.target.files); e.target.value = ''; }} />
              {busy ? <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} /> : <Upload size={22} style={{ color: 'var(--text-muted)' }} />}
              <span className="text-xs text-center px-4" style={{ color: 'var(--text-secondary)' }}>Drop files, photos, videos — or drag Instagram reel links</span>
            </div>
            <div className="flex gap-1.5">
              <input
                value={paste}
                onChange={e => setPaste(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ingestText(); } }}
                placeholder="Paste link / reel / note…"
                className="flex-1 rounded-lg px-2.5 py-2 text-xs outline-none"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
              />
              <button type="button" onClick={() => void ingestText()} disabled={busy || !paste.trim()} className="px-3 rounded-lg text-xs font-medium disabled:opacity-40" style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.25)' }}>
                Add
              </button>
            </div>
            <div className="flex gap-1">
              {(['all', 'pending', 'built'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFilter(f)} className="flex-1 text-[10px] py-1 rounded-md uppercase tracking-wide" style={{ background: filter === f ? 'rgba(34,211,238,0.12)' : 'transparent', color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {visible.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Nothing here yet — drop something.</p>
            )}
            {visible.map(it => {
              const active = selected?.id === it.id;
              const pct = it.analysis?.overallUsefulness;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  className="w-full text-left rounded-lg px-2.5 py-2 flex items-start gap-2"
                  style={{ background: active ? 'rgba(34,211,238,0.1)' : 'transparent', border: active ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent' }}
                >
                  <KindIcon kind={it.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{it.name}</div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {it.analysisStatus === 'analysing' ? 'analysing…' : it.analysisStatus === 'done' && pct != null ? `${pct}% · ${usefulnessLabel(pct)}` : it.kind}
                      {it.builtAt ? ' · built' : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>Select or drop an item</div>
          ) : (
            <div className="max-w-2xl space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <KindIcon kind={selected.kind} />
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {selected.analysis?.title || selected.name}
                    </h2>
                  </div>
                  {selected.url && (
                    <a href={selected.url} target="_blank" rel="noreferrer" className="text-[11px] break-all" style={{ color: 'var(--accent-cyan)' }}>{selected.url}</a>
                  )}
                </div>
                <div className="flex gap-1">
                  {selected.analysisStatus !== 'analysing' && (
                    <button type="button" onClick={() => void analyseThinkThanksItem(selected.id).then(refresh)} className="p-2 rounded-lg hover:bg-white/5" title="Re-analyse">
                      <Sparkles size={14} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  )}
                  <button type="button" onClick={() => { deleteThinkThanksItem(selected.id); setSelectedId(null); refresh(); }} className="p-2 rounded-lg hover:bg-white/5" title="Delete">
                    <Trash2 size={14} style={{ color: '#f87171' }} />
                  </button>
                </div>
              </div>

              {selected.analysisStatus === 'analysing' && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent-cyan)' }}>
                  <Loader2 size={16} className="animate-spin" /> Analysing…
                </div>
              )}

              {selected.analysis && (
                <>
                  <section>
                    <h3 className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>What it is</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.analysis.whatItIs || selected.analysis.description}</p>
                  </section>
                  <section>
                    <h3 className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>How we can use it</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.analysis.howToUse}</p>
                  </section>
                  <section>
                    <h3 className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>App fit</h3>
                    <div className="space-y-2">
                      {selected.analysis.fits.map(f => {
                        const meta = TARGET_APPS.find(t => t.id === f.app);
                        return (
                          <div key={f.app} className="flex items-center gap-3">
                            <div className="w-28 text-xs" style={{ color: meta?.color ?? 'var(--text-secondary)' }}>{meta?.label ?? f.app}</div>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${f.percent}%`, background: usefulnessColor(f.percent) }} />
                            </div>
                            <div className="w-10 text-right text-xs font-mono" style={{ color: usefulnessColor(f.percent) }}>{f.percent}%</div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                      Overall: {selected.analysis.overallUsefulness}% — {usefulnessLabel(selected.analysis.overallUsefulness)}
                    </p>
                  </section>
                  <section>
                    <h3 className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Target app(s) for BUILD</h3>
                    <div className="flex flex-wrap gap-2">
                      {TARGET_APPS.map(a => {
                        const on = selectedApps.includes(a.id);
                        const fit = selected.analysis?.fits.find(f => f.app === a.id)?.percent;
                        return (
                          <button key={a.id} type="button" onClick={() => toggleApp(a.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs" style={{ border: on ? `1px solid ${a.color}66` : '1px solid rgba(255,255,255,0.08)', background: on ? `${a.color}18` : 'rgba(255,255,255,0.02)', color: on ? a.color : 'var(--text-secondary)' }}>
                            {on && <Check size={12} />}
                            {a.label}
                            {fit != null && <span className="font-mono opacity-70">{fit}%</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section>
                    <h3 className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Composer — add context before BUILD</h3>
                    <textarea
                      value={composer}
                      onChange={e => setComposer(e.target.value)}
                      rows={4}
                      placeholder="e.g. Make this a sidebar widget on Home, store in global brain, prefer TypeScript…"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-y"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                    />
                  </section>
                  <button
                    type="button"
                    onClick={() => void onBuild()}
                    disabled={building || !selectedApps.length}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(168,85,247,0.2))', border: '1px solid rgba(34,211,238,0.35)', color: '#e0f7fa', boxShadow: '0 0 24px rgba(34,211,238,0.15)' }}
                  >
                    {building ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    BUILD
                  </button>
                  {selected.builtAt && (
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Last built {new Date(selected.builtAt).toLocaleString()}
                      {selected.builtApps?.length ? ` → ${selected.builtApps.map(a => TARGET_APPS.find(t => t.id === a)?.label ?? a).join(', ')}` : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
