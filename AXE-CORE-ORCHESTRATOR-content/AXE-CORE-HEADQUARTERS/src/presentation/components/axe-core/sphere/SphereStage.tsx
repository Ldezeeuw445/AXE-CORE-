/**
 * SphereStage — Living Display on Home, nu als 3D-podium.
 *
 * De bol blijft de bestaande AxeCoreSphere (plaat) of HolographicSphere.
 * Wat AXE zegt of toont landt als matzwarte kaarten in het midden van dat
 * vak: tekst, beeld, grafiek, kaart, tabel, html, en "N agents working".
 * Geen mock in dit pad — de kaarten komen uit podiumKaartenVan().
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Pin, PinOff, X } from 'lucide-react';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import { ProjectionBody } from '@/presentation/components/axe-core/sphere/ProjectionBody';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';
import { subscribeAxeEvent } from '@/infrastructure/events/eventBus';
import { moodForMode, type ProjectionPayload } from '@/domain/sphere/projectionTypes';
import {
  antwoordIsHuidig,
  podiumDemoAan,
  podiumDemoKaarten,
  podiumKaartenVan,
  streamVanDezeBeurt,
  type PodiumKaart,
} from '@/domain/sphere/podium';
import { podiumKrachtVan, webglBeschikbaar, type PodiumKracht } from '@/domain/sphere/podiumKracht';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useNavigate } from 'react-router';
import { usePodiumAandacht } from '@/presentation/store/podiumAandachtStore';
import { ANTWOORD_RUST_MS, PLEK, antwoordBlijft, ordenTegels, zichtbareTegels } from '@/domain/sphere/podiumAandacht';
import './axePodium.css';

const EASE_EMERGE = [0.16, 1, 0.3, 1] as const;

function meetKracht(): PodiumKracht {
  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const webgl = (() => {
    try {
      const c = document.createElement('canvas');
      return webglBeschikbaar(c.getContext.bind(c) as (type: string) => unknown);
    } catch {
      return false;
    }
  })();
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number };
  return podiumKrachtVan({
    reducedMotion: reduced,
    webgl,
    cores: nav?.hardwareConcurrency,
    geheugenGb: nav?.deviceMemory,
  });
}

function demoVlag(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem('axe_podium_demo');
  } catch {
    return null;
  }
}

/**
 * `bol`: welke sphere er onder de projectie staat. Op de plaat (Tauri-glas) is dat
 * AxeCoreSphere, daarbuiten de Three-versie. Tot 9 okt 2026 tekende Home op de
 * plaat alleen AxeCoreSphere, en dan was dit hele podium er niet: "laat New York
 * zien" maakte een projectie die nergens werd getoond, op de Mac mini en de iMac.
 *
 * `agenten` / `goedkeuringen`: dezelfde telling als de Home-tegels, zodat het
 * podium niet een tweede "N agents" verzint.
 */
export function SphereStage({
  status,
  bol,
  agenten = 0,
  goedkeuringen = 0,
}: {
  status: CoreStatus;
  bol?: ReactNode;
  agenten?: number;
  goedkeuringen?: number;
}) {
  const phase = useSphereProjectionStore(s => s.phase);
  const payload = useSphereProjectionStore(s => s.payload);
  const queue = useSphereProjectionStore(s => s.queue);
  const dismiss = useSphereProjectionStore(s => s.dismiss);
  const dismissAll = useSphereProjectionStore(s => s.dismissAll);
  const focus = useSphereProjectionStore(s => s.focus);
  const project = useSphereProjectionStore(s => s.project);
  const markProjecting = useSphereProjectionStore(s => s.markProjecting);

  const voiceStatus = useVoiceStore(s => s.voiceStatus);
  const response = useVoiceStore(s => s.response);
  const conversation = useVoiceStore(s => s.conversation);

  const [kracht] = useState(meetKracht);

  const lastAxe = [...conversation].reverse().find(m => m.role === 'axe');
  const lastUser = [...conversation].reverse().find(m => m.role === 'user');
  const dezeBeurt = streamVanDezeBeurt({
    voiceStatus,
    laatsteAxeTs: lastAxe?.timestamp ?? null,
    laatsteUserTs: lastUser?.timestamp ?? null,
  });
  const stream = dezeBeurt ? (response || '').trim() : '';
  const zelfdeBeurt = !!lastAxe && (!lastUser || lastAxe.timestamp >= lastUser.timestamp);
  const antwoord = (stream || (zelfdeBeurt ? lastAxe?.text : '') || '').trim();
  const antwoordHuidig = antwoordIsHuidig({
    voiceStatus,
    laatsteAxeTs: lastAxe?.timestamp ?? null,
    laatsteUserTs: lastUser?.timestamp ?? null,
    heeftStream: !!stream,
  });

  /* Na het antwoord komen de aandachtstegels terug: een minuut na het praten,
     of meteen als je de kaart wegklikt. Projecties sluiten zelf (Esc/X). */
  const [weggelegdTs, setWeggelegdTs] = useState<number | null>(null);
  const [nuTik, setNuTik] = useState(() => Date.now());
  const laatsteAxeTs = lastAxe?.timestamp ?? null;
  useEffect(() => {
    if (voiceStatus !== 'idle' || laatsteAxeTs == null) return;
    const over = laatsteAxeTs + ANTWOORD_RUST_MS - Date.now();
    if (over <= 0) { setNuTik(Date.now()); return; }
    const t = window.setTimeout(() => setNuTik(Date.now()), over + 50);
    return () => window.clearTimeout(t);
  }, [voiceStatus, laatsteAxeTs]);
  const blijft = antwoordBlijft({ voiceStatus, laatsteAxeTs, nu: Math.max(nuTik, Date.now()), weggelegdTs });

  const liveKaarten = useMemo(
    () => podiumKaartenVan({
      phase,
      payload,
      antwoord,
      vraag: lastUser?.text,
      voiceStatus,
      antwoordHuidig: antwoordHuidig && blijft,
      agenten,
      goedkeuringen,
    }),
    [phase, payload, antwoord, lastUser?.text, voiceStatus, antwoordHuidig, blijft, agenten, goedkeuringen],
  );

  const demo = podiumDemoAan(demoVlag(), import.meta.env.DEV);
  const kaarten = liveKaarten.length || !demo ? liveKaarten : podiumDemoKaarten();
  const hoofd = kaarten.find(k => k.soort !== 'agenten') ?? null;
  /* Rust (26 nov): de aandachtstegels uit het dashboard. Ze wijken voor een
     antwoord of projectie en komen daarna terug. Zijn er tegels, dan is de
     losse agent-pil overbodig: de agents-tegel zegt hetzelfde. */
  const aandacht = usePodiumAandacht(s => s.tegels);
  const strook = usePodiumAandacht(s => s.strook);
  const vast = usePodiumAandacht(s => s.vast);
  const wisselVast = usePodiumAandacht(s => s.wisselVast);
  const volgorde = usePodiumAandacht(s => s.volgorde);
  const sleep = usePodiumAandacht(s => s.sleep);
  const extra = usePodiumAandacht(s => s.extra);
  const voren = usePodiumAandacht(s => s.voren);
  const [sleepId, setSleepId] = useState<string | null>(null);
  const navigate = useNavigate();
  /* Fase 2: tijdens een antwoord blijven alleen de vastgezette tegels staan;
     een aangeklikte tegel groeit uit in het vak (alleen in rust). */
  const tegelsNu = ordenTegels(zichtbareTegels(aandacht, vast, !!hoofd), volgorde);
  const [openId, setOpenId] = useState<string | null>(null);
  const toonTegels = tegelsNu.length > 0 && !uitgegroeidOpen(openId, !!hoofd, aandacht, extra);
  const uitgegroeid = !hoofd && openId
    ? aandacht.find(t => t.id === openId) ?? (extra?.id === openId ? extra : null)
    : null;
  /* Een antwoord sluit de uitgegroeide tegel; daarna begin je weer in rust. */
  const heeftHoofd = !!hoofd;
  useEffect(() => { if (heeftHoofd) setOpenId(null); }, [heeftHoofd]);
  /* Fase 3: "wat wacht er" / "laat trading zien" haalt een tegel naar voren.
     Het korte AXE-antwoord in de chat hoort niet als kaart op het toneel:
     die leggen we meteen weg, zodat de tegel zelf het antwoord is. */
  useEffect(() => {
    if (!voren) return;
    setWeggelegdTs(voren.ts);
    setOpenId(voren.id);
  }, [voren]);
  const agentKaart = aandacht.length ? null : kaarten.find(k => k.soort === 'agenten') ?? null;

  const projecting = phase === 'opening' || phase === 'projecting' || phase === 'closing';
  const mode = payload?.mode ?? 'none';
  useMemo(() => moodForMode(mode), [mode]);

  useEffect(() => {
    const unsub1 = subscribeAxeEvent('axe:sphere-project', (p: ProjectionPayload) => {
      const cur = useSphereProjectionStore.getState();
      if (cur.payload?.id === p.id && (cur.phase === 'opening' || cur.phase === 'projecting')) {
        return;
      }
      project(p);
    });
    const unsub2 = subscribeAxeEvent('axe:sphere-dismiss', () => dismiss());
    return () => { unsub1(); unsub2(); };
  }, [project, dismiss]);

  useEffect(() => {
    if (phase !== 'opening') return;
    const t = setTimeout(() => markProjecting(), 100);
    return () => clearTimeout(t);
  }, [phase, markProjecting]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && projecting) dismiss();
      else if (e.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projecting, dismiss]);

  useEffect(() => {
    if (phase === 'idle' || phase === 'closing') {
      window.dispatchEvent(new CustomEvent('axe-sphere-morph', { detail: { key: 'sphere' } }));
      return;
    }
    if (!payload) return;
    window.dispatchEvent(
      new CustomEvent('axe-sphere-morph', { detail: { key: 'scatter' } }),
    );
  }, [payload?.id, mode, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const heeftInhoud = !!hoofd || !!uitgegroeid;
  const sphereOpacity = heeftInhoud ? (projecting ? 0.22 : 0.45) : 1;
  const sphereScale = heeftInhoud ? 1.02 : 1;

  const podium = useRef<HTMLDivElement | null>(null);
  const [vrij, setVrij] = useState<{ hoog: number; top: number } | null>(null);
  useEffect(() => {
    const meet = () => {
      const el = podium.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const chatTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--axe-chat-top'));
      const onder = Number.isFinite(chatTop) && chatTop > r.top ? Math.min(r.bottom, chatTop - 14) : r.bottom;
      const boven = Math.max(r.top, 64);
      setVrij({ hoog: Math.max(220, Math.round(onder - boven)), top: Math.round(boven - r.top) });
    };
    meet();
    window.addEventListener('resize', meet);
    const t = window.setInterval(meet, 1500);
    return () => { window.removeEventListener('resize', meet); window.clearInterval(t); };
  }, [heeftInhoud]);

  return (
    <div
      ref={podium}
      className="axe-podium"
      data-axe-podium
      data-kracht={kracht}
      data-axe-podium-inhoud={hoofd?.soort ?? 'leeg'}
    >
      <div className="axe-podium-ruimte">
        <div className="axe-podium-toneel">
          <div className="axe-podium-vloer" aria-hidden />
          <div className="axe-podium-horizon" aria-hidden />
          <div className="axe-podium-gloed" aria-hidden />

          <motion.div
            className="axe-podium-bol"
            animate={{ opacity: sphereOpacity, scale: sphereScale }}
            transition={{ duration: 0.45, ease: EASE_EMERGE }}
          >
            {bol ?? <HolographicSphere status={status} />}
          </motion.div>

          <div className="axe-podium-kaarten">
            <AnimatePresence mode="sync">
              {hoofd && (
                <motion.div
                  key={hoofd.id}
                  className="axe-podium-kaart-beweging"
                  initial={{ opacity: 0, scale: 0.72, y: 18 }}
                  animate={{ opacity: phase === 'closing' ? 0 : 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.72, y: 12 }}
                  transition={{ duration: kracht === 'plat' ? 0.01 : 0.35, ease: EASE_EMERGE }}
                >
                <div
                  className={`axe-podium-kaart axe-podium-kaart--${hoofd.maat}`}
                  data-axe-podium-kaart={hoofd.soort}
                  data-maat={hoofd.maat}
                  style={vrij && hoofd.maat === 'vol' ? { maxHeight: vrij.hoog } : undefined}
                >
                  {hoofd.payloadId && payload ? (
                    <>
                      <button
                        type="button"
                        onClick={() => dismiss()}
                        className="absolute top-3 right-3 z-30 rounded-full p-1.5"
                        style={{
                          background: 'rgba(0,0,0,0.75)',
                          color: 'rgba(255,255,255,0.85)',
                          border: '1px solid rgba(255,255,255,0.18)',
                        }}
                        title="Esc"
                      >
                        <X size={15} />
                      </button>
                      <div
                        className="axe-podium-kaart-lijf"
                        style={{ minHeight: hoofd.soort === 'kaart' ? 320 : undefined }}
                        onWheel={(e) => {
                          if (hoofd.soort === 'kaart' || hoofd.maat === 'vol') e.stopPropagation();
                        }}
                      >
                        <ProjectionBody payload={payload} />
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setWeggelegdTs(laatsteAxeTs ?? Date.now())}
                        className="absolute top-3 right-3 z-30 rounded-full p-1.5"
                        data-axe-podium-weg
                        aria-label="Put the answer away"
                        style={{
                          background: 'rgba(0,0,0,0.75)',
                          color: 'rgba(255,255,255,0.85)',
                          border: '1px solid rgba(255,255,255,0.18)',
                        }}
                        title="Put away"
                      >
                        <X size={15} />
                      </button>
                      <AntwoordKaart kaart={hoofd} />
                    </>
                  )}
                </div>
                </motion.div>
              )}
              {uitgegroeid && (
                <motion.div
                  key={`tegel-${uitgegroeid.id}`}
                  className="axe-podium-kaart-beweging"
                  initial={{ opacity: 0, scale: 0.8, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 30 }}
                  transition={{ duration: kracht === 'plat' ? 0.01 : 0.3, ease: EASE_EMERGE }}
                >
                  <div className="axe-podium-kaart axe-podium-kaart--compact axe-podium-uitgegroeid" data-axe-podium-uitgegroeid={uitgegroeid.id} data-toon={uitgegroeid.toon}>
                    <button type="button" onClick={() => setOpenId(null)} className="absolute top-3 right-3 z-30 rounded-full p-1.5"
                      aria-label="Close" title="Esc"
                      style={{ background: 'rgba(0,0,0,0.75)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.18)' }}>
                      <X size={15} />
                    </button>
                    <div className="flex h-full min-h-0 flex-col px-6 pb-4 pt-5">
                      <div className="axe-podium-tegel-titel mb-2 pr-8 text-[15px]">{uitgegroeid.titel}</div>
                      <ul className="axe-podium-uitgegroeid-lijst min-h-0 flex-1 overflow-y-auto">
                        {(uitgegroeid.details.length ? uitgegroeid.details : [uitgegroeid.regel]).map((r, n) => <li key={n}>{r}</li>)}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="axe-podium-chip axe-podium-knop" data-axe-podium-open
                          onClick={() => { setOpenId(null); navigate(uitgegroeid.route); }}>
                          <ArrowUpRight size={12} /> Open {PLEK[uitgegroeid.id]}
                        </button>
                        {uitgegroeid.id !== 'nieuws' && <button type="button" className="axe-podium-chip axe-podium-knop" data-axe-podium-vast={vast.has(uitgegroeid.id) ? 'aan' : 'uit'}
                          onClick={() => wisselVast(uitgegroeid.id)}
                          title="A pinned tile stays visible while AXE answers">
                          {vast.has(uitgegroeid.id) ? <><PinOff size={12} /> Unpin</> : <><Pin size={12} /> Pin</>}
                        </button>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {!hoofd && strook && (
              <motion.button
                key="strook"
                type="button"
                className="axe-podium-strook"
                data-axe-podium-strook
                onClick={() => navigate('/tasks')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: kracht === 'plat' ? 0.01 : 0.25 }}
              >
                {strook}
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {toonTegels && (
              <motion.div
                key="aandacht"
                className="axe-podium-aandacht"
                data-axe-podium-aandacht={tegelsNu.length}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24, scale: 0.96 }}
                transition={{ duration: kracht === 'plat' ? 0.01 : 0.3, ease: EASE_EMERGE }}
              >
                {tegelsNu.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className="axe-podium-tegel"
                    data-axe-podium-tegel={t.id}
                    data-toon={t.toon}
                    data-open={openId === t.id ? '1' : undefined}
                    data-sleept={sleepId === t.id ? '1' : undefined}
                    draggable={!hoofd}
                    onDragStart={(e) => { setSleepId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); }}
                    onDragEnd={() => setSleepId(null)}
                    onDragOver={(e) => { if (sleepId && sleepId !== t.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const van = e.dataTransfer.getData('text/plain') || sleepId;
                      if (van && van !== t.id) sleep(tegelsNu.map(x => x.id), van, t.id);
                      setSleepId(null);
                    }}
                    onClick={() => (hoofd ? navigate(t.route) : setOpenId(id => (id === t.id ? null : t.id)))}
                    title={`${t.titel} · ${t.regel}`}
                  >
                    <span className="axe-podium-tegel-titel">
                      {vast.has(t.id) && <Pin size={10} className="mr-1 inline-block align-[-1px] opacity-70" aria-label="pinned" />}
                      {t.titel}
                    </span>
                    <span className="axe-podium-tegel-regel">{t.regel}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {agentKaart && (
            <div className="axe-podium-agenten" data-axe-podium-kaart="agenten">
              {agentKaart.titel}
            </div>
          )}

          {hoofd?.payloadId && payload && (
            <div className="axe-podium-onderschrift">
              <div className="axe-podium-chip">
                <b>{payload.mode.toUpperCase()}</b>
                {' · '}
                {payload.title}
              </div>
              {queue.length > 1 && queue.filter(q => q.id !== payload.id).map(q => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => focus(q.id)}
                  className="axe-podium-chip truncate max-w-[140px]"
                  title={`${q.mode} · ${q.title}`}
                >
                  {q.mode} · {q.title}
                </button>
              ))}
              {queue.length > 1 && (
                <button type="button" onClick={() => dismissAll()} className="axe-podium-chip">
                  clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AntwoordKaart({ kaart }: { kaart: PodiumKaart }) {
  return (
    <div className="flex h-full min-h-0 flex-col px-6 pb-4 pt-5">
      <div className="mb-3 flex-shrink-0 pr-2">
        <div className="truncate text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary, #F5F0E6)' }}>
          {kaart.titel}
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto pr-1 text-[13px] leading-relaxed"
        style={{ scrollbarWidth: 'thin', color: 'var(--text-secondary, rgba(235,240,245,0.92))' }}
      >
        <MarkdownMessage text={kaart.tekst || '—'} />
      </div>
    </div>
  );
}

/** Staat er een uitgegroeide tegel open (dan wijkt de rij)? */
function uitgegroeidOpen(openId: string | null, heeftHoofd: boolean, aandacht: readonly { id: string }[], extra: { id: string } | null): boolean {
  if (!openId || heeftHoofd) return false;
  return aandacht.some(t => t.id === openId) || extra?.id === openId;
}
