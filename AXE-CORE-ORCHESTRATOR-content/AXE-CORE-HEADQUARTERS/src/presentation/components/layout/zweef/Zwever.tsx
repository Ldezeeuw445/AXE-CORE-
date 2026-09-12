/**
 * Iets dat over de tab heen zweeft en dat je kunt verplaatsen.
 *
 * Zie DESIGN.md, "Ruit": uitsluitend voor wat zweeft of beweegt over andere
 * inhoud -- de telefoon op Home, de bolwidget op de browsertab. Het materiaal
 * zit in de css (.axe-ruit); dit stuk regelt alleen de plek en het slepen.
 *
 * Slepen kan aan alles binnen de zwever dat `data-greep` draagt. Niet aan het
 * geheel, want er zit een canvas in dat je zelf wilt kunnen draaien en een
 * iframe dat zijn eigen aanrakingen wil. Tijdens het slepen schrijft dit direct
 * in de stijl in plaats van via React: een iframe dat zestig keer per seconde
 * opnieuw gerenderd wordt hapert, en dat is precies wat je bij slepen niet
 * wilt. Pas bij loslaten gaat de plek naar de state en naar localStorage.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { type Anker, type Maat, type Punt, beginPositie, bewaarPositie, klem } from './zweefPositie';

interface ZweverProps {
  /** De sleutel waaronder de plek bewaard wordt. Uniek per zwever. */
  naam: string;
  /** Waar hij begint als hij nog nooit verplaatst is. */
  anker: Anker;
  /** Zijn maat, voor het klemmen binnen het venster. */
  maat: Maat;
  /** Vastgepind: niet te verslepen. */
  vast?: boolean;
  className?: string;
  children: ReactNode;
}

function meetVenster(): Maat {
  if (typeof window === 'undefined') return { b: 1728, h: 1080 };
  return { b: window.innerWidth, h: window.innerHeight };
}

function wilReset(): boolean {
  try { return new URLSearchParams(window.location.search).get('reset') === '1'; } catch { return false; }
}

/* Wat je niet mag pakken om te slepen: alles waar je op klikt of in typt, en
   het canvas van de bol -- dat draait zelf mee met de muis. */
const NIET_SLEPEN = 'button, input, textarea, select, a, canvas, iframe';

interface Sleep { sx: number; sy: number; l: number; t: number; maat: Maat }

export function Zwever({ naam, anker, maat, vast = false, className = '', children }: ZweverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const sleep = useRef<Sleep | null>(null);
  const [venster, setVenster] = useState<Maat>(meetVenster);
  const [pos, setPos] = useState<Punt>(() => beginPositie(naam, anker, maat, meetVenster(), window.localStorage, wilReset()));
  const [sleept, setSleept] = useState(false);

  useEffect(() => {
    const bij = () => setVenster(meetVenster());
    window.addEventListener('resize', bij);
    return () => window.removeEventListener('resize', bij);
  }, []);

  /* Bij elke render opnieuw geklemd: verkleint het venster, of wordt de
     zwever groter (telefoon liggend), dan schuift hij mee naar binnen. */
  const plek = klem(pos, maat, venster);

  const omlaag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (vast) return;
    const doel = e.target as HTMLElement;
    if (doel.closest(NIET_SLEPEN)) return;
    if (!doel.closest('[data-greep]')) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    sleep.current = { sx: e.clientX, sy: e.clientY, l: plek.x, t: plek.y, maat: { b: r.width, h: r.height } };
    el.setPointerCapture(e.pointerId);
    setSleept(true);
    e.preventDefault();
  };

  const beweeg = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    const el = ref.current;
    if (!s || !el) return;
    const p = klem({ x: s.l + e.clientX - s.sx, y: s.t + e.clientY - s.sy }, s.maat, meetVenster());
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  };

  const los = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    const el = ref.current;
    if (!s || !el) return;
    sleep.current = null;
    const p = klem({ x: s.l + e.clientX - s.sx, y: s.t + e.clientY - s.sy }, s.maat, meetVenster());
    setPos(p);
    setSleept(false);
    bewaarPositie(naam, p, window.localStorage);
    try { el.releasePointerCapture(e.pointerId); } catch { /* al losgelaten */ }
  };

  const klassen = ['axe-zwever', className, sleept ? 'axe-zwever--sleept' : '', vast ? 'axe-zwever--vast' : '']
    .filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={klassen}
      style={{ left: plek.x, top: plek.y, width: maat.b, height: maat.h }}
      data-zwever={naam}
      onPointerDown={omlaag}
      onPointerMove={beweeg}
      onPointerUp={los}
      onPointerCancel={los}
    >
      {children}
    </div>
  );
}
