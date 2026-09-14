/**
 * De NorthSea-wereldkaart, direct op de plaat.
 *
 * ## Geen achtergrond, met opzet
 *
 * UI-MAATSTAF regel 1: de achtergrond is de plaat. Een kaart met tegels
 * schildert een donker vlak over het glas heen -- dat is wat de oude 3D-kaart
 * deed. Hier alleen lijnen: kustlijnen iets helderder, landsgrenzen zacht, en
 * daartussen blijft het bureaublad zichtbaar.
 *
 * ## Wat de kaart wél en niet belooft
 *
 * De regels staan in domain/northsea/kaart.ts: alleen deals die aan beide
 * kanten eenduidig te plaatsen zijn krijgen een lijn. Een lijn naar een land
 * of naar de vestiging van een bedrijf (in plaats van een haven of stad uit de
 * deal zelf) is zwakker getekend. En onder de legenda staat hoeveel deals er
 * NIET op staan, met de reden: een kaart die de helft stil weglaat leest als
 * een rustige desk.
 *
 * Tekst op het scherm in het Engels (AGENTS.md), toelichting hier in het Nederlands.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
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

export function WereldKaart({
  deals, lagen, fout,
}: {
  /** null = nog aan het laden; undefined = de lokale API stuurt geen kaartdata. */
  deals: KaartDeal[] | null | undefined;
  lagen: Record<KaartLaag, boolean>;
  fout?: string | null;
}) {
  const vakRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [maat, setMaat] = useState({ b: 0, h: 0 });
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [muis, setMuis] = useState<[number, number] | null>(null);
  const [zweeft, setZweeft] = useState<{ punt: KaartPunt; x: number; y: number } | null>(null);

  const { landen, land, middelpunten } = useMemo(() => wereldkaart(), []);

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
    const z = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [maat.b, maat.h]])
      .on('zoom', e => setT(e.transform));
    select(svg).call(z);
    zoomRef.current = z;
    return () => { select(svg).on('.zoom', null); };
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
    if (svg && zoomRef.current) zoomRef.current.scaleBy(select(svg), factor);
  };
  const herstel = () => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.transform(select(svg), zoomIdentity);
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
            <path d={pad(geoGraticule10()) ?? ''} fill="none" stroke="rgba(148,163,184,0.10)"
              strokeWidth={0.5} strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
            {landen.features.map(f => (
              <path key={f.properties.name} d={pad(f) ?? ''} fill="none"
                stroke="rgba(125,211,252,0.16)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={pad(land) ?? ''} fill="none" stroke="rgba(125,211,252,0.42)"
              strokeWidth={0.8} vectorEffect="non-scaling-stroke" filter="url(#ns-gloed)" />

            {lagen.routes && kaart?.routes.map(r => (
              <path key={r.id} d={routePad(r)} fill="none" stroke={STAND_STIJL[r.stand].kleur}
                strokeOpacity={r.benaderd ? 0.38 : 0.85} strokeWidth={r.benaderd ? 1 : 1.5}
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
                  <circle r={straal * 2.8} fill={kleur} opacity={0.14} />
                  {p.hub
                    ? <path d={STER} transform={`scale(${1.05 / k})`} fill="#F8FAFC" filter="url(#ns-gloed)" />
                    : <circle r={straal} fill={kleur} filter="url(#ns-gloed)" />}
                  {(p.hub || p.locatie.soort === 'haven') && (
                    <text x={8 / k} y={4 / k} fontSize={11 / k} fill="var(--text-primary)"
                      style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 3 / k }}>
                      {p.locatie.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* De legenda, linksboven, zoals het ontwerp -- tekst op de plaat, geen kaartje. */}
      <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
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
      <div className="pointer-events-none absolute bottom-3 left-4 flex h-12 w-12 flex-col items-center justify-center rounded-full"
        style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'var(--text-muted)' }}>
        <span className="text-[9px] font-semibold" style={{ color: 'var(--accent-cyan)' }}>N</span>
        <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--text-secondary)' }} />
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 overflow-hidden rounded-lg"
        style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
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
        <div className="pointer-events-none absolute bottom-4 right-4 font-mono-data text-[11px]" style={{ color: 'var(--text-muted)' }}>
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
