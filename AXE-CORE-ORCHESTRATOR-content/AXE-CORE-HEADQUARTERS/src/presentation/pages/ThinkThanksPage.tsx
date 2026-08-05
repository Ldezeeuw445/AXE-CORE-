/**
 * THINKTHANKS — drop inbox + vision analysis + app scores + BUILD library.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check, Image as ImageIcon, Library, Link2, Loader2, RefreshCw, Sparkles, Trash2, Upload,
} from 'lucide-react';
import {
  TARGET_APPS,
  type TargetApp,
  type ThinkThanksItem,
  addFilesToThinkThanks,
  addTextOrLinkToThinkThanks,
  analyseThinkThanksItem,
  buildThinkThanksItem,
  deleteThinkThanksItem,
  listBuiltLibrary,
  listThinkThanksItems,
  usefulnessColor,
  usefulnessLabel,
} from '@/infrastructure/persistence/thinkThanksService';

export default function ThinkThanksPage() {
  const [items, setItems] = useState<ThinkThanksItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [composer, setComposer] = useState('');
  const [selectedApps, setSelectedApps] = useState<TargetApp[]>(['axe-core']);
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setItems(listThinkThanksItems());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1200);
    return () => clearInterval(t);
  }, [refresh]);

  const selected = useMemo(
    () => items.find(i => i.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const library = useMemo(() => listBuiltLibrary(), [items]);

  const libraryByCat = useMemo(() => {
    const map = new Map<string, ThinkThanksItem[]>();
    for (const it of library) {
      const cat = it.libraryCategory || it.analysis?.tags?.[0] || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }
    return [...map.entries()];
  }, [library]);

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const ingestFiles = async (files: FileList | File[]) => {
    if (!files || (files as FileList).length === 0) return;
    setBusy(true);
    try {
      const created = await addFilesToThinkThanks(files);
      refresh();
      if (created[0]) setSelectedId(created[0].id);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files?.length) void ingestFiles(files);
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
    if (text?.trim()) {
      void addTextOrLinkToThinkThanks(text.trim()).then(it => {
        refresh();
        setSelectedId(it.id);
      });
    }
  };

  const onBuild = async () => {
    if (!selected) return;
    setBuilding(true);
    try {
      await buildThinkThanksItem(selected.id, { apps: selectedApps, composerContext: composer });
      refresh();
    } finally {
      setBuilding(false);
    }
  };

  const toggleApp = (id: TargetApp) => {
    setSelectedApps(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const a = selected?.analysis;

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="px-4 sm:px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-[9px] font-mono tracking-[0.22em] uppercase" style={{ color: 'var(--accent-cyan)' }}>
          Intelligence
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: '#F5F0E6' }}>
              THINKTHANKS
            </h1>
            <p className="text-[12px] mt-0.5 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Drop screenshots and ideas — vision reads the image, scores fit per app (AXON Memory is not trading), then BUILD into a categorized library.
            </p>
          </div>
          <button type="button" onClick={refresh} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-0">
        <div className="flex flex-col min-h-0 border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div
            className="m-3 rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
            style={{
              border: `1px dashed ${dragging ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.12)'}`,
              background: dragging ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.02)',
              minHeight: 100,
            }}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('tt-file')?.click()}
          >
            <input id="tt-file" type="file" multiple accept="image/*,video/*,.pdf,.txt,.md,audio/*" className="hidden" onChange={e => e.target.files && void ingestFiles(e.target.files)} />
            {busy ? <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} /> : <Upload size={18} style={{ color: 'var(--accent-cyan)' }} />}
            <span className="text-[11px] text-center" style={{ color: 'var(--text-secondary)' }}>Drop photos, files, links</span>
          </div>
          <div className="px-3 pb-2 flex gap-1">
            <input
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="Paste Instagram / URL / note…"
              className="flex-1 rounded-lg px-2 py-1.5 text-[11px] outline-none"
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && linkInput.trim()) {
                  void addTextOrLinkToThinkThanks(linkInput.trim()).then(it => {
                    setLinkInput('');
                    refresh();
                    setSelectedId(it.id);
                  });
                }
              }}
            />
            <button
              type="button"
              className="p-1.5 rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-cyan)' }}
              onClick={() => {
                if (!linkInput.trim()) return;
                void addTextOrLinkToThinkThanks(linkInput.trim()).then(it => {
                  setLinkInput('');
                  refresh();
                  setSelectedId(it.id);
                });
              }}
            >
              <Link2 size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {items.length === 0 && (
              <p className="text-[11px] text-center py-6" style={{ color: 'var(--text-muted)' }}>Nothing yet</p>
            )}
            {items.map(it => {
              const on = selected?.id === it.id;
              const pct = it.analysis?.overallUsefulness;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  className="w-full text-left rounded-lg px-2.5 py-2 flex gap-2 items-start"
                  style={{
                    background: on ? 'rgba(34,211,238,0.1)' : 'transparent',
                    border: `1px solid ${on ? 'rgba(34,211,238,0.28)' : 'transparent'}`,
                  }}
                >
                  <div className="w-9 h-9 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {it.previewUrl ? <img src={it.previewUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={14} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium truncate" style={{ color: '#F5F0E6' }}>{it.analysis?.title || it.name}</div>
                    <div className="text-[9px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span>{it.kind}</span>
                      {it.analysisStatus === 'analysing' && <Loader2 size={10} className="animate-spin" />}
                      {pct != null && <span style={{ color: usefulnessColor(pct) }}>{pct}%</span>}
                      {it.builtAt && <Library size={10} style={{ color: '#34d399' }} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>Select or drop an item</div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-4">
                {selected.previewUrl && (
                  <div className="rounded-xl overflow-hidden flex-shrink-0 w-full sm:w-48 h-40" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    <img src={selected.previewUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[16px] font-semibold" style={{ color: '#F5F0E6' }}>{a?.title || selected.name}</h2>
                    <div className="flex gap-1">
                      <button type="button" title="Re-analyse" className="p-1.5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }} onClick={() => void analyseThinkThanksItem(selected.id).then(refresh)}>
                        <RefreshCw size={13} />
                      </button>
                      <button type="button" className="p-1.5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#f87171' }} onClick={() => { deleteThinkThanksItem(selected.id); setSelectedId(null); refresh(); }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {selected.analysisStatus === 'analysing' && (
                    <p className="text-[12px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--accent-cyan)' }}>
                      <Loader2 size={12} className="animate-spin" /> Reading image / scoring apps…
                    </p>
                  )}
                  {selected.analysisError && (
                    <p className="text-[11px] mt-1" style={{ color: '#fbbf24' }}>Vision note: {selected.analysisError} — heuristic scores applied.</p>
                  )}
                  {a && <p className="text-[12px] mt-2" style={{ color: 'var(--text-secondary)' }}>{a.description}</p>}
                  {a && (
                    <div className="mt-2 text-[11px] font-medium" style={{ color: usefulnessColor(a.overallUsefulness) }}>
                      {a.overallUsefulness}% · {usefulnessLabel(a.overallUsefulness)}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                <section className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 className="text-[9px] font-mono tracking-[0.16em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>App fit scores</h3>
                  {(a?.fits ?? []).map(f => {
                    const meta = TARGET_APPS.find(t => t.id === f.app);
                    return (
                      <div key={f.app} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span style={{ color: meta?.color ?? '#fff' }}>{meta?.label ?? f.app}</span>
                          <span className="font-mono" style={{ color: usefulnessColor(f.percent) }}>{f.percent}%</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full" style={{ width: `${f.percent}%`, background: meta?.color ?? '#22d3ee' }} />
                        </div>
                        <p className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>{f.reason}</p>
                      </div>
                    );
                  })}
                  {!a?.fits?.length && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Waiting for analysis…</p>}
                </section>

                <section className="space-y-3">
                  {[
                    { k: 'What it is', v: a?.whatItIs },
                    { k: 'How we can use it', v: a?.howToUse },
                    { k: 'Why we should use it', v: a?.whyUseful },
                    { k: 'How we will make & use it', v: a?.howToMake },
                    { k: 'Smart notes', v: a?.smartNotes },
                  ].map(block => (
                    <div key={block.k} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <h3 className="text-[9px] font-mono tracking-[0.16em] uppercase mb-1.5" style={{ color: 'var(--accent-cyan)' }}>{block.k}</h3>
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                        {block.v || (selected.analysisStatus === 'analysing' ? '…' : '—')}
                      </p>
                    </div>
                  ))}
                </section>
              </div>

              <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <h3 className="text-[9px] font-mono tracking-[0.18em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Build</h3>
                <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                  Choose target apps. AXON Memory = shared context across apps — not trading bots.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {TARGET_APPS.map(app => {
                    const on = selectedApps.includes(app.id);
                    const fit = a?.fits?.find(f => f.app === app.id)?.percent;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => toggleApp(app.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
                        style={{
                          border: `1px solid ${on ? app.color + '55' : 'rgba(255,255,255,0.08)'}`,
                          background: on ? `${app.color}18` : 'rgba(255,255,255,0.02)',
                          color: on ? app.color : 'var(--text-secondary)',
                        }}
                      >
                        {on && <Check size={12} />}
                        {app.label}
                        {fit != null && <span className="font-mono opacity-70">{fit}%</span>}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={composer}
                  onChange={e => setComposer(e.target.value)}
                  rows={3}
                  placeholder="Optional: how to implement, where it lives, constraints…"
                  className="w-full rounded-xl px-3 py-2.5 text-[12px] outline-none resize-y mb-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={() => void onBuild()}
                  disabled={building || !selectedApps.length}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(168,85,247,0.2))',
                    border: '1px solid rgba(34,211,238,0.35)',
                    color: '#e0f7fa',
                  }}
                >
                  {building ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  BUILD
                </button>
                {selected.builtAt && (
                  <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                    Built {new Date(selected.builtAt).toLocaleString()}
                    {selected.builtApps?.length ? ` → ${selected.builtApps.map(id => TARGET_APPS.find(t => t.id === id)?.label ?? id).join(', ')}` : ''}
                    {selected.libraryCategory ? ` · ${selected.libraryCategory}` : ''}
                  </p>
                )}
              </div>

              <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Library size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <h3 className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>Library — built ideas</h3>
                </div>
                {library.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    After BUILD, items land here by category so you can integrate later in one place.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {libraryByCat.map(([cat, list]) => (
                      <div key={cat}>
                        <div className="text-[10px] font-medium mb-1.5" style={{ color: '#F5F0E6' }}>{cat}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {list.map(it => (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => setSelectedId(it.id)}
                              className="text-left rounded-lg px-3 py-2"
                              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                              <div className="text-[12px] font-medium truncate" style={{ color: '#F5F0E6' }}>{it.analysis?.title || it.name}</div>
                              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {it.builtApps?.map(id => TARGET_APPS.find(t => t.id === id)?.label ?? id).join(', ')}
                                {it.builtAt ? ` · ${new Date(it.builtAt).toLocaleDateString()}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
