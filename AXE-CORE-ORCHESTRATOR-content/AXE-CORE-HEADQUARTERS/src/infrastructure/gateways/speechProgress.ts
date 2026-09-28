/**
 * Hoever is AXE met uitspreken? Eén klein signaal, zodat de chat de tekst
 * precies zo ver kan tonen als de stem is -- "hij typt terwijl hij praat".
 *
 * `text` is de ORIGINELE tekst die aan speakGlobal ging (vóór het opschonen
 * voor de stem), zodat een chatbericht met precies die tekst weet dat hij
 * het is die nu wordt uitgesproken. Elk ander bericht blijft gewoon heel.
 *
 * Geen React hier: dit leeft in de infrastructuurlaag en wordt geschreven
 * door de stem. De hook in presentation leest het met useSyncExternalStore.
 */
export interface SpeechProgress {
  /** Tekst die nu wordt uitgesproken, of null als AXE niet praat. */
  text: string | null;
  /** 0..1 van de uitgesproken stem. */
  fraction: number;
}

let huidig: SpeechProgress = { text: null, fraction: 0 };
const luisteraars = new Set<() => void>();

function zet(volgende: SpeechProgress): void {
  huidig = volgende;
  for (const l of luisteraars) l();
}

export function getSpeechProgress(): SpeechProgress {
  return huidig;
}

export function subscribeSpeechProgress(l: () => void): () => void {
  luisteraars.add(l);
  return () => { luisteraars.delete(l); };
}

export function beginSpeechProgress(text: string): void {
  zet({ text, fraction: 0 });
}

/** Alleen vooruit: een late update mag getoonde woorden niet terugnemen. */
export function setSpeechFraction(fraction: number): void {
  if (huidig.text === null) return;
  const f = Math.min(1, Math.max(huidig.fraction, fraction));
  if (f === huidig.fraction) return;
  zet({ text: huidig.text, fraction: f });
}

/** Klaar, gestopt of mislukt: de tekst staat dan altijd weer helemaal. */
export function endSpeechProgress(): void {
  if (huidig.text === null) return;
  zet({ text: null, fraction: 0 });
}
