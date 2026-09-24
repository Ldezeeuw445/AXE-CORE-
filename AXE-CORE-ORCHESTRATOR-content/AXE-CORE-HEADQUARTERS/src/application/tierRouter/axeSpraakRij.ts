/**
 * Wachtrij voor job-resultaten. Ack gaat meteen; een job mag de gebruiker
 * niet afkappen. Flush zodra hij stopt met praten.
 */
import { moetSpraakWachtrij, type StemlusStand } from '@/domain/tierRouter/axeJobRegels';

const rij: string[] = [];

export function stemlusVanVoice(status: string, error?: string | null): StemlusStand {
  if (error) return 'error';
  if (status === 'listening') return 'listening';
  if (status === 'processing') return 'thinking';
  if (status === 'speaking') return 'speaking';
  return 'idle';
}

function zetInSpraakRij(text: string): void {
  const t = text.trim();
  if (t) rij.push(t);
}

export function neemSpraakRij(): string[] {
  return rij.splice(0, rij.length);
}

export function spraakRijLengte(): number {
  return rij.length;
}

let spreker: (text: string) => void = () => {};

export function zetSpraakSpreker(fn: (text: string) => void): void {
  spreker = fn;
}

export function flushAxeSpraakRij(): void {
  const stukken = neemSpraakRij();
  if (stukken.length === 0) return;
  spreker(stukken.join(' '));
}

export function kiesSpraakPad(
  text: string,
  stand: StemlusStand,
  bron: 'ack' | 'job',
): 'now' | 'queue' {
  if (moetSpraakWachtrij(stand, bron)) {
    zetInSpraakRij(text);
    return 'queue';
  }
  return 'now';
}
