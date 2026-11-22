/**
 * Twee zachte tonen, getekend met WebAudio (geen geluidsbestanden in de app).
 * Vraag: twee noten omhoog. Klaar: één ronde noot omlaag. Kort en stil (gain 0,06).
 */
import type { NotchGeluid } from '@/domain/overlay/notchPeeks';

export const GELUID_SLEUTEL = 'axe.notch.geluid';

export function geluidAan(): boolean {
  try { return localStorage.getItem(GELUID_SLEUTEL) !== 'uit'; } catch { return true; }
}

export function zetGeluid(aan: boolean): void {
  try { localStorage.setItem(GELUID_SLEUTEL, aan ? 'aan' : 'uit'); } catch { /* privévenster: dan blijft hij aan */ }
}

let ctx: AudioContext | null = null;

export function speelToon(soort: NotchGeluid): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    const nu = ctx.currentTime;
    const noten = soort === 'vraag' ? [660, 880] : [784, 523];
    noten.forEach((hz, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      const start = nu + i * 0.12;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.06, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      o.connect(g).connect(ctx!.destination);
      o.start(start);
      o.stop(start + 0.3);
    });
  } catch { /* geen audio: dan maar stil */ }
}
