/**
 * De NorthSea-wereldkaart, direct op de plaat.
 *
 * ## Geen achtergrond, wel land
 *
 * UI-MAATSTAF regel 1: de achtergrond is de plaat. De ZEE tekent dus niets --
 * daar blijft het bureaublad zichtbaar. Het LAND wel: elk land een gedempte
 * kleur uit zijn klimaat, en buren nooit dezelfde tint (zie kaartGeo.ts). Zo
 * houd je landen uit elkaar zonder dat het een kleurplaat wordt.
 *
 * ## Slepen en zoomen dat soepel voelt
 *
 * - De landen zitten in een eigen, gememoriseerde laag. Bij elke zoomstap
 *   verandert alleen de transform van de groep; 240 landpaden opnieuw
 *   renderen per muisbeweging was wat het schokkerig maakte.
 * - De zoomstand gaat hooguit één keer per frame naar React.
 * - Het wiel doet d3 niet zelf: een muiswiel zoomt met een korte overgang
 *   rond de muis, een trackpad met twee vingers SCHUIFT (zoals elke kaart op
 *   een Mac), knijpen zoomt direct.
 * - De kaart mag een stuk voorbij de rand: op zoom 1 past de wereld precies,
 *   en zonder speling kon je dan niet slepen.
 *
 * ## Wat de kaart wél en niet belooft
 *
 * De regels staan in domain/northsea/kaart.ts: alleen deals die aan beide
 * kanten eenduidig te plaatsen zijn krijgen een lijn. Een lijn naar een land
 * of vestiging is zwakker getekend, en onder de legenda staat wat er NIET op
 * staat en waarom.
 *
 * Tekst op het scherm in het Engels (AGENTS.md), toelichting hier in het Nederlands.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath, type GeoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3Zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { FeatureCollection, Geometry } from 'geojson';
import { Minus, Plus, RotateCw } from 'lucide-react';
import {
  bouwKaart, redenenNietGeplaatst,
  type DealStand, type KaartDeal, type KaartPunt, type KaartRoute,
} from '@/domain/northsea/kaart';
import { wereldkaart } from './kaartGeo';
import { REDEN_LABEL, SOORT_LABEL, STAND_STIJL, STAND_VOLGORDE } from './kaartStijl';

export type KaartLaag = 'routes' | 'havens' | 'tegenpartijen' | 'weer';

/** Welke kleur een punt krijgt als er meerdere standen samenkomen. Aandacht eerst. */
function dominanteStand(p: KaartPunt): DealStand {
  const prioriteit: DealStand[] = ['geblokkeerd', 'actief', 'gematcht', 'afgerond', 'overig'];
  const max = Math.max(...STAND_VOLGORDE.map(s => p.perStand[s]));
  return prioriteit.find(s => p.perStand[s] === max && max > 0) ?? 'overig';
}

function graden(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
}

const KNOP = 'flex h-8 w-9 items-center justify-center transition-colors hover:text-[var(--text-primary)]';
const KNOP_STIJL = { color: 'var(--text-secondary)' } as const;

const STER = 'M0,-6 L1.76,-2.43 L5.71,-1.85 L2.85,0.93 L3.53,4.85 L0,3 L-3.53,4.85 L-2.85,0.93 L-5.71,-1.85 L-1.76,-2.43 Z';

const MAX_ZOOM = 12;
const KNOP_DUUR_MS = 320;
const WIEL_DUUR_MS = 180;

/** Het land: één keer getekend per kaartmaat, niet per zoomstap. */
const LandLaag = memo(function LandLaag({ pad, landen, land, kleuren }: {
  pad: GeoPath;
  landen: FeatureCollection<Geometry, { name: string }>;
  land: FeatureCollection<Geometry>;
  kleuren: string[];
}) {
  return (
    <>
      <path d={pad(geoGraticule10()) ?? ''} fill="none" stroke="rgba(148,163,184,0.10)"
        strokeWidth={0.5} strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
      {landen.features.map((f, i) => (
        <path key={i} d={pad(f) ?? ''} fill={kleuren[i]} fillOpacity={0.8}
          stroke="rgba(6,10,14,0.55)" strokeWidth={0.6} vectorEffect="non-scaling-stroke">
          <title>{f.properties.name}</title>
        </path>
      ))}
      <path d={pad(land) ?? ''} fill="none" stroke="rgba(125,211,252,0.38)"
        strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
    </>
  );
});

export function WereldKaart({
  deals, lagen, fout, legendaTop = 12, vrijVan,
}: {
  /** null = nog aan het laden; undefined = de lokale API stuurt geen kaartdata. */
  deals: KaartDeal[] | null | undefined;
  lagen: Record<KaartLaag, boolean>;
  fout?: string | null;
  /** Hoe ver de legenda van de bovenkant staat -- de kaartjes liggen erboven. */
  legendaTop?: number;
  /** Een element dat over de onderkant van de kaart ligt (de dealtabel in het
   *  dock). Kompas, zoomknoppen en coördinaten schuiven erboven. */
  vrijVan?: string;
}) {
  const vakRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [maat, setMaat] = useState({ b: 0, h: 0 });
  const [onder, setOnder] = useState(0);

  /* De dealtabel komt via een portal in het dock, dus hij staat er pas een
     render later, en klapt open en dicht. Zoeken met een korte interval tot hij
     er is (geen MutationObserver op de hele body -- zie PlaatSlots), daarna
     alleen nog meten als hij of de kaart van maat verandert. */
  useEffect(() => {
    if (!vrijVan) return;
    let frame = 0;
    let gevonden: Element | null = null;
    const ro = new ResizeObserver(() => meet());
    function meet() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const vak = vakRef.current;
        if (!vak || !gevonden?.isConnected) { setOnder(0); return; }
        const a = vak.getBoundingClientRect();
        const b = gevonden.getBoundingClientRect();
        const overlapt = b.width > 0 && b.left < a.right && b.right > a.left && b.top < a.bottom;
        setOnder(overlapt ? Math.max(0, Math.round(a.bottom - b.top)) : 0);
      });
    }
    const zoek = () => {
      const el = document.querySelector(vrijVan);
      if (el === gevonden) return;
      if (gevonden) ro.unobserve(gevonden);
      gevonden = el;
      if (el) ro.observe(el);
      meet();
    };
    if (vakRef.current) ro.observe(vakRef.current);
    zoek();
    const iv = setInterval(zoek, 700);
    return () => { clearInterval(iv); cancelAnimationFrame(frame); ro.disconnect(); };
  }, [vrijVan]);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [muis, setMuis] = useState<[number, number] | null>(null);
  const [zweeft, setZweeft] = useState<{ punt: KaartPunt; x: number; y: number } | null>(null);

  const { landen, land, middelpunten, kleuren } = useMemo(() => wereldkaart(), []);

  useEffect(() => {
    const vak = vakRef.current;
    if (!vak) return;
    const ro = new ResizeObserver(([e]) => setMaat({ b: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(vak);
    return () => ro.disconnect();
  }, []);

  const projectie = useMemo(() => {
    if (!maat.b || !maat.h) return null;
    return geoNaturalEarth1().fitExtent([[12, 12], [maat.b - 12, maat.h - 12]], { type: 'Sphere' });
  }, [maat]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !maat.b) return;
    let frame = 0;
    let laatste: ZoomTransform = zoomTransform(svg);
    const z = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([[-maat.b * 0.35, -maat.h * 0.35], [maat.b * 1.35, maat.h * 1.35]])
      .duration(KNOP_DUUR_MS)
      // Het wiel doen we hieronder zelf; slepen en dubbelklikken laten we aan d3.
      .filter(e => e.type !== 'wheel' && !e.button)
      .on('zoom', e => {
        laatste = e.transform;
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; setT(laatste); });
      });
    const sel = select(svg);
    sel.call(z);
    zoomRef.current = z;

    const wiel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const p: [number, number] = [e.clientX - r.left, e.clientY - r.top];
      if (e.ctrlKey) {
        // Knijpen op een trackpad: kleine stapjes, direct volgen.
        z.scaleBy(sel, Math.pow(2, -e.deltaY * 0.01), p);
      } else if (e.deltaMode === 1 || Math.abs(e.deltaY) >= 40 && e.deltaX === 0) {
        // Een muiswiel: grove klikken, dus een korte overgang per klik.
        const stap = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        z.scaleBy(sel.transition().duration(WIEL_DUUR_MS), Math.pow(2, -stap * 0.0025), p);
      } else {
        // Twee vingers op een trackpad: schuiven, zoals elke kaart op een Mac.
        const k = zoomTransform(svg).k;
        z.translateBy(sel, -e.deltaX / k, -e.deltaY / k);
      }
    };
    svg.addEventListener('wheel', wiel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      svg.removeEventListener('wheel', wiel);
      sel.on('.zoom', null);
    };
  }, [maat]);

  const kaart = useMemo(() => (deals ? bouwKaart(deals, middelpunten) : null), [deals, middelpunten]);

  const pad = useMemo(() => (projectie ? geoPath(projectie) : null), [projectie]);

  /** Een grootcirkel als pad, gebroken waar hij over de rand van de kaart springt. */
  const routePad = (r: KaartRoute): string => {
    if (!projectie) return '';
    const tussen = geoInterpolate(r.van.lonlat, r.naar.lonlat);
    let d = '';
    let vorige: [number, number] | null = null;
    for (let i = 0; i <= 48; i++) {
      const p = projectie(tussen(i / 48));
      if (!p) continue;
      const sprong = vorige && Math.abs(p[0] - vorige[0]) > maat.b / 2;
      d += `${!vorige || sprong ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      vorige = p as [number, number];
    }
    return d;
  };

  const zichtbarePunten = (kaart?.punten ?? []).filter(p => {
    if (p.deals === 0) return lagen.tegenpartijen;           // alleen een vestiging
    if (p.locatie.soort === 'haven') return lagen.havens || lagen.routes;
    return lagen.routes || (lagen.tegenpartijen && p.tegenpartij);
  });

  const k = t.k;
  const zoomDoor = (factor: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.scaleBy(select(svg).transition().duration(KNOP_DUUR_MS), factor);
  };
  const herstel = () => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.transform(select(svg).transition().duration(KNOP_DUUR_MS * 1.5), zoomIdentity);
  };

  const coordinaat = (() => {
    if (!muis || !projectie?.invert) return null;
    const [x, y] = t.invert(muis);
    const ll = projectie.invert([x, y]);
    return ll && Number.isFinite(ll[0]) ? `${graden(ll[1], 'N', 'S')}, ${graden(ll[0], 'E', 'W')}` : null;
  })();

  const redenen = kaart ? redenenNietGeplaatst(kaart.nietGeplaatst) : [];

  return (
    <div ref={vakRef} className="axe-scene-vlak relative h-full w-full select-none" data-axe-doel="northsea-kaart">
      <svg
        ref={svgRef}
        width={maat.b}
        height={maat.h}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          setMuis([e.clientX - r.left, e.clientY - r.top]);
        }}
        onMouseLeave={() => { setMuis(null); setZweeft(null); }}
        role="img"
        aria-label="NorthSea deals world map"
      >
        <defs>
          <filter id="ns-gloed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {pad && (
          <g transform={t.toString()}>
            <LandLaag pad={pad} landen={landen} land={land} kleuren={kleuren} />

            {lagen.routes && kaart?.routes.map(r => (
              <path key={r.id} d={routePad(r)} fill="none" stroke={STAND_STIJL[r.stand].kleur}
                strokeOpacity={r.benaderd ? 0.45 : 0.9} strokeWidth={r.benaderd ? 1.1 : 1.6}
                strokeDasharray="5 6" vectorEffect="non-scaling-stroke" className="ns-route">
                <title>{`${r.deal.code ?? r.deal.product ?? 'Deal'}: ${r.van.label} → ${r.naar.label}${r.benaderd ? ' (approximate)' : ''}`}</title>
              </path>
            ))}

            {projectie && zichtbarePunten.map(p => {
              const xy = projectie(p.locatie.lonlat);
              if (!xy) return null;
              const kleur = p.deals === 0 ? '#A78BFA' : STAND_STIJL[dominanteStand(p)].kleur;
              const straal = (p.hub ? 4.6 : 3.2) / k;
              return (
                <g key={p.locatie.sleutel} transform={`translate(${xy[0]},${xy[1]})`}
                  onMouseEnter={e => setZweeft({ punt: p, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setZweeft(null)} style={{ cursor: 'pointer' }}>
                  <circle r={straal * 2.8} fill={kleur} opacity={0.16} />
                  {p.hub
                    ? <path d={STER} transform={`scale(${1.05 / k})`} fill="#F8FAFC" filter="url(#ns-gloed)" />
                    : <circle r={straal} fill={kleur} stroke="rgba(0,0,0,0.5)" strokeWidth={0.6 / k} filter="url(#ns-gloed)" />}
                  {(p.hub || p.locatie.soort === 'haven') && (
                    <text x={8 / k} y={4 / k} fontSize={11 / k} fill="var(--text-primary)"
                      style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 3 / k }}>
                      {p.locatie.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* De legenda, linksboven onder de kaartjes -- tekst op de plaat, geen kaartje. */}
      <div className="pointer-events-none absolute left-4 flex flex-col gap-1.5 text-[12px]"
        style={{ top: legendaTop, color: 'var(--text-secondary)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
        {STAND_VOLGORDE.filter(s => s !== 'overig' || (kaart?.tellers.overig ?? 0) > 0).map(s => (
          <div key={s} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAND_STIJL[s].kleur, boxShadow: `0 0 8px ${STAND_STIJL[s].kleur}` }} />
            <span>{STAND_STIJL[s].label}</span>
            {kaart && <span className="font-mono-data text-[11px]" style={{ color: 'var(--text-muted)' }}>{kaart.tellers[s]}</span>}
            {/* Zonder deze regel zegt de desk "24 actief" en de legenda "2": allebei
                waar, want een blokkade gaat voor. Zie dealStand. */}
            {kaart && s === 'geblokkeerd' && kaart.geblokkeerdActief > 0 && (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>incl. {kaart.geblokkeerdActief} active</span>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <svg width="11" height="11" viewBox="-6 -6 12 12"><path d={STER} fill="#F8FAFC" /></svg>
          <span>Key Trade Hubs</span>
        </div>
        {kaart && (
          <div className="mt-1 max-w-[260px] text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
            {kaart.routes.length} of {(deals ?? []).length} deals on the map
            {kaart.routes.some(r => r.benaderd) && ` · ${kaart.routes.filter(r => r.benaderd).length} approximate (faint)`}
            {redenen.length > 0 && (
              <> · not shown: {redenen.map(r => `${r.aantal} ${REDEN_LABEL[r.reden]}`).join(', ')}</>
            )}
          </div>
        )}
      </div>

      {(fout || deals === null || deals === undefined) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {fout ? `Map data unavailable: ${fout}` : deals === null ? 'Loading map…' : 'Map data not available from the local API yet — restart it to load the map fields.'}
        </div>
      )}

      {zweeft && (
        <div className="axe-paneel pointer-events-none fixed z-50 max-w-[260px] px-3 py-2 text-[12px]"
          style={{ left: zweeft.x + 14, top: zweeft.y + 14, height: 'auto', width: 'auto' }}>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{zweeft.punt.locatie.label}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {zweeft.punt.deals === 0 ? 'Counterparty office' : SOORT_LABEL[zweeft.punt.locatie.soort]}
            {zweeft.punt.locatie.soort !== 'land' && ` · ${zweeft.punt.locatie.land}`}
          </div>
          {zweeft.punt.deals > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {STAND_VOLGORDE.filter(s => zweeft.punt.perStand[s] > 0).map(s => (
                <div key={s} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: STAND_STIJL[s].kleur }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{STAND_STIJL[s].label}</span>
                  <span className="ml-auto font-mono-data">{zweeft.punt.perStand[s]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kompas linksonder, zoom middenonder, coördinaten rechtsonder: de plek uit het ontwerp. */}
      <div className="pointer-events-none absolute left-4 flex h-12 w-12 flex-col items-center justify-center rounded-full"
        style={{ bottom: onder + 12, border: '1px solid rgba(255,255,255,0.10)', color: 'var(--text-muted)', transition: 'bottom 180ms ease' }}>
        <span className="text-[9px] font-semibold" style={{ color: 'var(--accent-cyan)' }}>N</span>
        <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--text-secondary)' }} />
      </div>

      <div className="absolute left-1/2 flex -translate-x-1/2 overflow-hidden rounded-lg"
        style={{ bottom: onder + 12, background: 'var(--axe-barbtn)', boxShadow: 'var(--axe-tegel-op)', transition: 'bottom 180ms ease' }}>
        {/* Drie losse knoppen en geen lijst met functies erin: react-hooks/refs
            ziet een ref in een functie die tijdens het renderen in data wordt
            gestopt als een ref die tijdens het renderen gelezen wordt. */}
        <button type="button" onClick={() => zoomDoor(1.6)} title="Zoom in" aria-label="Zoom in" className={KNOP} style={KNOP_STIJL}>
          <Plus size={14} />
        </button>
        <button type="button" onClick={() => zoomDoor(1 / 1.6)} title="Zoom out" aria-label="Zoom out" className={KNOP} style={KNOP_STIJL}>
          <Minus size={14} />
        </button>
        <button type="button" onClick={herstel} title="Reset view" aria-label="Reset view" className={KNOP} style={KNOP_STIJL}>
          <RotateCw size={14} />
        </button>
      </div>

      {coordinaat && (
        <div className="pointer-events-none absolute right-4 font-mono-data text-[11px]" style={{ bottom: onder + 16, color: 'var(--text-muted)' }}>
          {coordinaat}
        </div>
      )}

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ns-route { animation: ns-stroom 1.6s linear infinite; }
        }
        @keyframes ns-stroom { to { stroke-dashoffset: -22; } }
      `}</style>
    </div>
  );
}
