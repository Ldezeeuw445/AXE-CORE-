/**
 * Rustig geluid (Life OS, 26 nov): zacht bruin ruis met een trage, lage
 * akkoordlaag, gemaakt in de browser met Web Audio. Geen bestand, geen
 * streamingdienst, geen account. Zachtjes in en uit (2 s).
 */
let ctx: AudioContext | null = null;
let hoofd: GainNode | null = null;
let bronnen: AudioScheduledSourceNode[] = [];

const VOLUME = 0.18;

export function rustGeluidAan(): boolean {
  return !!ctx && ctx.state !== 'closed' && bronnen.length > 0;
}

export async function startRustGeluid(): Promise<boolean> {
  if (rustGeluidAan()) return true;
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  try { await ctx.resume(); } catch { /* blijft suspended zonder aanraking */ }
  hoofd = ctx.createGain();
  hoofd.gain.value = 0;
  hoofd.connect(ctx.destination);

  // Bruine ruis: 4 s buffer in een lus.
  const n = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let k = 0; k < 2; k++) {
    const d = buf.getChannelData(k);
    let laatste = 0;
    for (let i = 0; i < n; i++) {
      laatste = (laatste + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = laatste * 3.2;
    }
  }
  const ruis = ctx.createBufferSource();
  ruis.buffer = buf;
  ruis.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const ruisGain = ctx.createGain();
  ruisGain.gain.value = 0.55;
  ruis.connect(filter).connect(ruisGain).connect(hoofd);
  ruis.start();
  bronnen = [ruis];

  // Akkoordlaag (A2, E3, C#4) die heel langzaam ademt.
  for (const [hz, sterkte] of [[110, 0.05], [164.81, 0.035], [277.18, 0.02]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = sterkte;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = sterkte * 0.6;
    lfo.connect(lfoGain).connect(g.gain);
    osc.connect(g).connect(hoofd);
    osc.start();
    lfo.start();
    bronnen.push(osc, lfo);
  }
  hoofd.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 2);
  return true;
}

export function stopRustGeluid(): void {
  const c = ctx;
  const h = hoofd;
  const b = bronnen;
  ctx = null;
  hoofd = null;
  bronnen = [];
  if (!c || !h) return;
  try {
    h.gain.cancelScheduledValues(c.currentTime);
    h.gain.setValueAtTime(h.gain.value, c.currentTime);
    h.gain.linearRampToValueAtTime(0, c.currentTime + 2);
  } catch { /* al dicht */ }
  setTimeout(() => {
    for (const s of b) { try { s.stop(); } catch { /* al gestopt */ } }
    void c.close().catch(() => {});
  }, 2100);
}
