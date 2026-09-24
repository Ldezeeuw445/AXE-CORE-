/**
 * Per-beurt latentie: van einde spraak tot eerste audio.
 * Geen I/O — de wrappers zetten de merken, de stream leest ze.
 */
export interface BeurtMeting {
  sttMs: number | null;
  routeMs: number | null;
  firstTokenMs: number | null;
  firstAudioMs: number | null;
}

const LEEG: BeurtMeting = {
  sttMs: null,
  routeMs: null,
  firstTokenMs: null,
  firstAudioMs: null,
};

let t0 = 0;
let meting: BeurtMeting = { ...LEEG };

function nu(): number {
  return Date.now();
}

export function startBeurt(opts?: { sttMs?: number; t0?: number }): void {
  t0 = opts?.t0 ?? nu();
  meting = { ...LEEG, sttMs: opts?.sttMs ?? 0 };
}

export function startBeurtIndienNodig(): void {
  if (t0 && nu() - t0 < 20_000) return;
  startBeurt({ sttMs: 0 });
}

export function markBeurt(k: 'route' | 'firstToken' | 'firstAudio', extraMs?: number): void {
  if (!t0 && extraMs == null) return;
  const waarde = extraMs ?? Math.round(nu() - t0);
  if (k === 'route') {
    meting.routeMs = waarde;
    return;
  }
  if (k === 'firstToken' && meting.firstTokenMs == null) meting.firstTokenMs = waarde;
  if (k === 'firstAudio' && meting.firstAudioMs == null) meting.firstAudioMs = waarde;
}

export function leesBeurt(): BeurtMeting {
  return { ...meting };
}

export function beurtRegel(m: BeurtMeting = meting): string {
  const deel = (naam: string, v: number | null) => (v == null ? null : `${naam} ${v}ms`);
  return ['lat', deel('stt', m.sttMs), deel('route', m.routeMs), deel('token', m.firstTokenMs), deel('audio', m.firstAudioMs)]
    .filter(Boolean)
    .join(' · ');
}
