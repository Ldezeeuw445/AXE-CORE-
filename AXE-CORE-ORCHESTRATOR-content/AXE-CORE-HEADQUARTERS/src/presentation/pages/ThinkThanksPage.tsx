/**
 * THINKTHANKS — growth engine UI.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  Check, Image as ImageIcon, Library, Link2, Loader2, Plug, RefreshCw, Sparkles, Trash2, Upload,
} from 'lucide-react';
import {
  TARGET_APPS,
  type TargetApp,
  type ThinkThanksItem,
  addFilesToThinkThanks,
  addTextOrLinkToThinkThanks,
  analyseThinkThanksItem,
  buildThinkThanksItem,
  computeMergeSuggestions,
  deleteThinkThanksItem,
  integrateThinkThanksItem,
  listBuiltLibrary,
  listMergeSuggestions,
  listThinkThanksItems,
  listAppGrowth,
  runScheduledReanalysis,
  topFit,
  usefulnessColor,
  usefulnessLabel,
} from '@/infrastructure/persistence/thinkThanksService';

export default function ThinkThanksPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ThinkThanksItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [composer, setComposer] = useState('');
  const [selectedApps, setSelectedApps] = useState<TargetApp[]>(['axe-core']);
  const [building, setBuilding] = useState(false);
  const [integrating, setIntegrating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [merges, setMerges] = useState(listMergeSuggestions());
  const [batchMsg, setBatchMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(listThinkThanksItems());
    setMerges(listMergeSuggestions());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    void runScheduledReanalysis(false).then(r => {
      if (r.analysed > 0) {
        setBatchMsg(`Batch re-analysis: ${r.analysed} items · ${r.merges} merge ideas`);
        refresh();
      }
    });
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
    if (e.dataTransfer.files?.length) void ingestFiles(e.dataTransfer.files);
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

  const onIntegrate = async (id: string) => {
    setIntegrating(true);
    try {
      await integrateThinkThanksItem(id);
      refresh();
    } finally {
      setIntegrating(false);
    }
  };

  const toggleApp = (id: TargetApp) => {
    setSelectedApps(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const a = selected?.analysis;

  return (
    <motion.div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="px-4 sm:px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-[9px] font-mono tracking-[0.22em] uppercase" style={{ color: 'var(--accent-cyan)' }}>Growth engine</div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: '#F5F0E6' }}>THINKTHANKS</h1>
            <p className="text-[12px] mt-0.5 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Drop anything — enrich (scrape / vision), extract product value, plan UI + backend + memory, BUILD, then INTEGRATE.
            </p>
            {batchMsg && <p className="text-[10px] mt-1" style={{ color: 'var(--accent-cyan)' }}>{batchMsg}</p>}
          </div>
          <div className="flex gap-1">
            <button type="button" className="p-2 rounded-lg text-[10px] font-medium" style={{ color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.25)' }}
              onClick={() => { void runScheduledReanalysis(true).then(r => { setBatchMsg(`Re-ran ${r.analysed} · ${r.merges} merges`); computeMergeSuggestions(); refresh(); }); }}>
              Batch
            </button>
            <button type="button" onClick={refresh} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}><RefreshCw size={14} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col min-h-0 border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="m-3 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer"
            style={{ border: `1px dashed ${dragging ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.12)'}`, background: dragging ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.02)', minHeight: 88 }}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('tt-file')?.click()}>
            <input id="tt-file" type="file" multiple accept="image/*,video/*,.pdf,.txt,.md,audio/*" className="hidden" onChange={e => e.target.files && void ingestFiles(e.target.files)} />
            {busy ? <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} /> : <Upload size={18} style={{ color: 'var(--accent-cyan)' }} />}
            <span className="text-[11px] text-center" style={{ color: 'var(--text-secondary)' }}>Drop photos, files, links</span>
          </div>
          <div className="px-3 pb-2 flex gap-1">
            <input value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="Paste URL / Instagram / note…"
              className="flex-1 rounded-lg px-2 py-1.5 text-[11px] outline-none"
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
              onKeyDown={e => { if (e.key === 'Enter' && linkInput.trim()) { void addTextOrLinkToThinkThanks(linkInput.trim()).then(it => { setLinkInput(''); refresh(); setSelectedId(it.id); }); } }} />
            <button type="button" className="p-1.5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-cyan)' }}
              onClick={() => { if (!linkInput.trim()) return; void addTextOrLinkToThinkThanks(linkInput.trim()).then(it => { setLinkInput(''); refresh(); setSelectedId(it.id); }); }}>
              <Link2 size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {items.map(it => {
              const on = selected?.id === it.id;
              const top = topFit(it);
              const appMeta = top ? TARGET_APPS.find(t => t.id === top.app) : null;
              return (
                <button key={it.id} type="button" onClick={() => setSelectedId(it.id)}
                  className="w-full text-left rounded-lg px-2 py-2 flex gap-2 items-start"
                  style={{ background: on ? 'rgba(34,211,238,0.1)' : 'transparent', border: `1px solid ${on ? 'rgba(34,211,238,0.28)' : 'transparent'}` }}>
                  {top ? (
                    <div className="w-9 flex-shrink-0 text-center font-mono text-[11px] font-semibold pt-1" style={{ color: appMeta?.color ?? usefulnessColor(top.percent) }}>{top.percent}%</div>
                  ) : <div className="w-9 flex-shrink-0" />}
                  <div className="w-9 h-9 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {it.previewUrl ? <img src={it.previewUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={14} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium truncate" style={{ color: '#F5F0E6' }}>{it.analysis?.title || it.name}</div>
                    <div className="text-[9px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      <span>{it.kind}</span>
                      {(it.analysisStatus === 'analysing' || it.analysisStatus === 'enriching') && <Loader2 size={10} className="animate-spin" />}
                      {it.builtAt && <Library size={10} style={{ color: '#34d399' }} />}
                      {it.integratedAt && <Plug size={10} style={{ color: 'var(--accent-cyan)' }} />}
                    </div>
                    {top && appMeta && (
                      <div className="mt-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${top.percent}%`, background: appMeta.color }} />
                      </div>
                    )}
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
                      <button type="button" className="p-1.5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }} onClick={() => void analyseThinkThanksItem(selected.id).then(refresh)}><RefreshCw size={13} /></button>
                      <button type="button" className="p-1.5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#f87171' }} onClick={() => { deleteThinkThanksItem(selected.id); setSelectedId(null); refresh(); }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {(selected.analysisStatus === 'analysing' || selected.analysisStatus === 'enriching') && (
                    <p className="text-[12px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--accent-cyan)' }}>
                      <Loader2 size={12} className="animate-spin" />
                      {selected.analysisStatus === 'enriching' ? 'Enriching (scrape / fetch)…' : 'Deep analysis…'}
                    </p>
                  )}
                  {a?.enrichmentSummary && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Enrichment: {a.enrichmentSummary}</p>}
                  {a && <p className="text-[12px] mt-2" style={{ color: 'var(--text-secondary)' }}>{a.description}</p>}
                  {a && <div className="mt-2 text-[11px] font-medium" style={{ color: usefulnessColor(a.overallUsefulness) }}>{a.overallUsefulness}% · {usefulnessLabel(a.overallUsefulness)}</div>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
                <section className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h3 className="text-[9px] font-mono tracking-[0.16em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>App fit</h3>
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
                </section>
                <section className="space-y-2.5">
                  {[
                    { k: 'What it is', v: a?.whatItIs },
                    { k: 'How we can use it', v: a?.howToUse },
                    { k: 'Why we should use it', v: a?.whyUseful },
                    { k: 'How we make it better', v: a?.howToMake },
                    { k: 'UI placement', v: a?.placementUi },
                    { k: 'Backend', v: a?.placementBackend },
                    { k: 'Memory depth', v: a?.placementMemory },
                    { k: 'Smart notes', v: a?.smartNotes },
                  ].map(block => (
                    <div key={block.k} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <h3 className="text-[9px] font-mono tracking-[0.16em] uppercase mb-1" style={{ color: 'var(--accent-cyan)' }}>{block.k}</h3>
                      <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{block.v || '…'}</p>
                    </div>
                  ))}
                  {!!a?.actionPlan?.length && (
                    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <h3 className="text-[9px] font-mono tracking-[0.16em] uppercase mb-2" style={{ color: 'var(--accent-cyan)' }}>Action plan</h3>
                      <ol className="space-y-1.5">
                        {a.actionPlan.map((s, i) => (
                          <li key={i} className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                            <span className="font-medium" style={{ color: '#F5F0E6' }}>{i + 1}. {s.phase}</span> — {s.detail}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </section>
              </div>

              <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <h3 className="text-[9px] font-mono tracking-[0.18em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Build</h3>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {TARGET_APPS.map(app => {
                    const on = selectedApps.includes(app.id);
                    const fit = a?.fits?.find(f => f.app === app.id)?.percent;
                    return (
                      <button key={app.id} type="button" onClick={() => toggleApp(app.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
                        style={{ border: `1px solid ${on ? app.color + '55' : 'rgba(255,255,255,0.08)'}`, background: on ? `${app.color}18` : 'rgba(255,255,255,0.02)', color: on ? app.color : 'var(--text-secondary)' }}>
                        {on && <Check size={12} />}{app.label}{fit != null && <span className="font-mono opacity-70">{fit}%</span>}
                      </button>
                    );
                  })}
                </div>
                <textarea value={composer} onChange={e => setComposer(e.target.value)} rows={3} placeholder="Composer: constraints, preferred tab…"
                  className="w-full rounded-xl px-3 py-2.5 text-[12px] outline-none resize-y mb-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
                <button type="button" onClick={() => void onBuild()} disabled={building || !selectedApps.length}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(168,85,247,0.2))', border: '1px solid rgba(34,211,238,0.35)', color: '#e0f7fa' }}>
                  {building ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} BUILD
                </button>
              </div>

              {merges.length > 0 && (
                <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 className="text-[9px] font-mono tracking-[0.18em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Merge opportunities</h3>
                  <div className="space-y-2">
                    {merges.slice(0, 6).map(m => (
                      <div key={m.id} className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ color: '#F5F0E6' }}>{m.titles.join(' + ')}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{m.reason}</div>
                        <div className="font-mono mt-0.5" style={{ color: usefulnessColor(m.projectedPercent) }}>→ ~{m.projectedPercent}% on {TARGET_APPS.find(t => t.id === m.bestApp)?.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected?.builtAt && (
                <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 className="text-[9px] font-mono tracking-[0.18em] uppercase mb-2" style={{ color: 'var(--accent-cyan)' }}>
                    {selected.integratedAt ? 'Integrated' : 'Ready to integrate'}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: selected.persistedTo?.library ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)', color: selected.persistedTo?.library ? '#34d399' : 'var(--text-muted)' }}>Library</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: selected.persistedTo?.globalMemory ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.06)', color: selected.persistedTo?.globalMemory ? '#22d3ee' : 'var(--text-muted)' }}>Neural / Memory</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: selected.persistedTo?.rag ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.06)', color: selected.persistedTo?.rag ? '#c084fc' : 'var(--text-muted)' }}>RAG</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: selected.persistedTo?.obsidian ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)', color: selected.persistedTo?.obsidian ? '#fbbf24' : 'var(--text-muted)' }}>Obsidian</span>
                  </div>
                  {selected.libraryNotePath && (
                    <p className="text-[10px] mb-2 font-mono" style={{ color: 'var(--text-muted)' }}>{selected.libraryNotePath}</p>
                  )}
                  {selected.liveArtifact && (
                    <p className="text-[11px] mb-2" style={{ color: '#34d399' }}>
                      Live: {selected.liveArtifact.kind} — <span className="font-medium">{selected.liveArtifact.label}</span>
                      {selected.liveArtifact.href && (
                        <> · <button type="button" className="underline" style={{ color: 'var(--accent-cyan)' }}
                          onClick={() => selected.liveArtifact?.href && navigate(selected.liveArtifact.href)}>
                          Open in app
                        </button></>
                      )}
                      {selected.integratedAt ? ' (active)' : ' (standby until Integrate)'}
                    </p>
                  )}
                  {selected.codeBuild && (
                    <div className="text-[11px] mb-2 rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="font-medium" style={{ color: selected.codeBuild.status === 'error' ? '#f87171' : selected.codeBuild.status === 'running' ? 'var(--accent-cyan)' : selected.codeBuild.patchesApplied > 0 ? '#34d399' : '#fbbf24' }}>
                        Magic code: {selected.codeBuild.status}
                        {selected.codeBuild.patchesApplied > 0 ? ` · ${selected.codeBuild.patchesApplied} patch(es)` : ''}
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>{selected.codeBuild.message}</div>
                      {(selected.codeBuild.filesTouched?.length ?? 0) > 0 && (
                        <div className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {selected.codeBuild.filesTouched.slice(0, 6).join(' · ')}
                        </div>
                      )}
                      {(selected.codeBuild.log?.length ?? 0) > 0 && (
                        <div className="mt-2 max-h-28 overflow-y-auto font-mono text-[10px] space-y-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {selected.codeBuild.log!.slice(-12).map((line, i) => (
                            <div key={i}>› {line}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {listAppGrowth().filter(g => g.itemId === selected.id).length > 0 && (
                    <div className="text-[11px] mb-2 rounded-lg px-2.5 py-2" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}>
                      <div className="font-medium mb-1" style={{ color: 'var(--accent-cyan)' }}>App growth</div>
                      {listAppGrowth().filter(g => g.itemId === selected.id).map(g => (
                        <div key={g.id} style={{ color: 'var(--text-muted)' }}>
                          → {g.app}: {g.kind}{g.agentId ? ` · agent ${g.agentId}` : ''}{g.capability ? ` · cap ${g.capability}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {selected.smokeCheck && (
                    <div className="text-[11px] mb-2 rounded-lg px-2.5 py-2" style={{ background: selected.smokeCheck.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${selected.smokeCheck.ok ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
                      <div className="font-medium mb-1" style={{ color: selected.smokeCheck.ok ? '#34d399' : '#f87171' }}>
                        Smoke-check: {selected.smokeCheck.ok ? 'all clear' : 'issues found'}
                      </div>
                      {selected.smokeCheck.checks.map((c, i) => (
                        <div key={i} className="flex gap-2">
                          <span style={{ color: c.pass ? '#34d399' : '#f87171' }}>{c.pass ? '✓' : '✗'}</span>
                          <span style={{ color: 'var(--text-muted)' }}><b style={{ color: '#F5F0E6' }}>{c.name}</b> — {c.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(selected.integrateActionPlan?.length ?? 0) > 0 && (
                    <div className="space-y-1.5 mb-3">
                      <div className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Integrate action plan</div>
                      {selected.integrateActionPlan!.map((s, i) => (
                        <div key={i} className="text-[11px] flex gap-2">
                          <span className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--accent-cyan)' }}>{i + 1}</span>
                          <div>
                            <span className="font-medium" style={{ color: '#F5F0E6' }}>{s.phase}</span>
                            <span style={{ color: 'var(--text-muted)' }}> — {s.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!selected.integratedAt && (
                    <button type="button" disabled={integrating} onClick={() => void onIntegrate(selected.id)}
                      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold"
                      style={{ background: 'rgba(34,211,238,0.14)', border: '1px solid rgba(34,211,238,0.35)', color: 'var(--accent-cyan)' }}>
                      {integrating ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                      Integrate into live app
                    </button>
                  )}
                </div>
              )}

              <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Library size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <h3 className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>Library — ready to integrate</h3>
                </div>
                {library.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>After BUILD, blueprints land here. INTEGRATE wires them into the live app.</p>
                ) : (
                  <div className="space-y-3">
                    {libraryByCat.map(([cat, list]) => (
                      <div key={cat}>
                        <div className="text-[10px] font-medium mb-1.5" style={{ color: '#F5F0E6' }}>{cat}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {list.map(it => (
                            <div key={it.id} className="rounded-xl p-3 flex gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                                {it.previewUrl ? <img src={it.previewUrl} alt="" className="w-full h-full object-cover" /> : <Library size={18} style={{ color: 'var(--text-muted)' }} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-medium truncate" style={{ color: '#F5F0E6' }}>{it.analysis?.title || it.name}</div>
                                <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{it.librarySummary || it.analysis?.whatItIs || 'Built blueprint'}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  {it.persistedTo?.library && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>Library</span>}
                                  {it.persistedTo?.globalMemory && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.12)', color: '#22d3ee' }}>Memory</span>}
                                  {it.persistedTo?.rag && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc' }}>RAG</span>}
                                  {it.persistedTo?.obsidian && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>Obsidian</span>}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                  <button type="button" disabled={integrating} onClick={() => void onIntegrate(it.id)}
                                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold"
                                    style={{ background: it.integratedAt ? 'rgba(16,185,129,0.12)' : 'rgba(34,211,238,0.14)', border: `1px solid ${it.integratedAt ? 'rgba(16,185,129,0.35)' : 'rgba(34,211,238,0.35)'}`, color: it.integratedAt ? '#34d399' : 'var(--accent-cyan)' }}>
                                    {integrating ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}
                                    {it.integratedAt ? 'Integrated' : 'Integrate'}
                                  </button>
                                  <button type="button" className="text-[10px]" style={{ color: 'var(--text-muted)' }} onClick={() => setSelectedId(it.id)}>Open</button>
                                </div>
                              </div>
                            </div>
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
