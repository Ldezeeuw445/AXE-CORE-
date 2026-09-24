/**
 * AXE's stem: George (Kokoro-82M, `bm_george`), lokaal en gratis.
 *
 * De dienst draait op de Mac mini als launchd-agent `com.axe.tts` op
 * 127.0.0.1:8766 (backend/axe_tts/app.py). Luka koos George op 23 sep 2026
 * op gehoor uit vijf samples.
 *
 * Zin voor zin: stuk n wordt afgespeeld terwijl stuk n+1 al gemaakt wordt,
 * zodat het eerste woord na ~2 s klinkt in plaats van na de hele alinea. De
 * dienst maakt één stuk tegelijk, dus "vooruit ophalen" is precies één stuk.
 *
 * Alles loopt door één AnalyserNode, zodat de VoiceBeam reageert op wat er
 * echt uit de speakers komt -- dezelfde afspraak als bij de Cedar-stem.
 */
import { splitIntoSpeechChunks } from '@/domain/speechChunks';
import { AXE_STEM_ID, stemStandVanHealth, type StemStand } from '@/domain/stemIdentiteit';

export const AXE_KOKORO_VOICE = AXE_STEM_ID;
export const AXE_TTS_ORIGIN = (import.meta.env.VITE_AXE_TTS_ORIGIN as string | undefined) ?? 'http://127.0.0.1:8766';
const ORIGIN = AXE_TTS_ORIGIN;

/** Live: draait com.axe.tts, en zegt hij nog steeds George? */
export async function probeGeorgeStem(): Promise<StemStand> {
  try {
    const r = await fetch(`${ORIGIN}/health`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return stemStandVanHealth(null, `axe_tts_${r.status}`);
    const body = (await r.json()) as { ok?: boolean; voice?: string };
    return stemStandVanHealth({ ok: Boolean(body.ok), voice: body.voice });
  } catch (e) {
    return stemStandVanHealth(null, e instanceof Error ? e.message : String(e));
  }
}

let generatie = 0;
let huidige: HTMLAudioElement | null = null;
let controllers: AbortController[] = [];
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let niveauData: Uint8Array<ArrayBuffer> | null = null;
let rafId: number | null = null;
// Pauzeren vuurt geen 'ended': zonder dit bleef elke onderbroken beurt
// (barge-in) eeuwig op het huidige stuk wachten.
let rondHuidigeAf: (() => void) | null = null;

/** Live 0..1 RMS van George's afspelen, gelezen door de VoiceBeam. */
export function getKokoroTtsLevel(): number {
  if (!analyser || !niveauData || !huidige || huidige.paused) return 0;
  analyser.getByteTimeDomainData(niveauData);
  let som = 0;
  for (const v of niveauData) { const x = (v - 128) / 128; som += x * x; }
  return Math.min(1, Math.sqrt(som / niveauData.length) * 3.2);
}

export function stopKokoro(): void {
  generatie++;
  for (const c of controllers) c.abort();
  controllers = [];
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  if (huidige) { huidige.pause(); huidige.src = ''; huidige = null; }
  const af = rondHuidigeAf;
  rondHuidigeAf = null;
  af?.();
}

async function haalStuk(tekst: string): Promise<Blob> {
  const c = new AbortController();
  controllers.push(c);
  const r = await fetch(`${ORIGIN}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: tekst, voice: AXE_KOKORO_VOICE }),
    signal: c.signal,
  });
  if (!r.ok) throw new Error(`axe_tts_${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.blob();
}

function speel(blob: Blob, opVoortgang: (binnenStuk: number) => void, mijn: number, opStart?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    huidige = audio;
    ctx ??= new AudioContext();
    void ctx.resume().catch(() => {});
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      niveauData = new Uint8Array(analyser.fftSize);
      analyser.connect(ctx.destination);
    }
    ctx.createMediaElementSource(audio).connect(analyser);

    const tik = () => {
      if (mijn !== generatie) return;
      if (audio.duration > 0) opVoortgang(Math.min(1, audio.currentTime / audio.duration));
      rafId = requestAnimationFrame(tik);
    };
    let afgerond = false;
    const klaar = (fout?: Error) => {
      if (afgerond) return;
      afgerond = true;
      if (rondHuidigeAf === rondAf) rondHuidigeAf = null;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      URL.revokeObjectURL(url);
      if (huidige === audio) huidige = null;
      if (fout) reject(fout); else resolve();
    };
    const rondAf = () => klaar();
    rondHuidigeAf = rondAf;
    audio.onended = () => { opVoortgang(1); klaar(); };
    audio.onerror = () => klaar(new Error('audio_kon_niet_spelen'));
    audio.play().then(() => {
      opStart?.();
      rafId = requestAnimationFrame(tik);
    }, (e) => klaar(e instanceof Error ? e : new Error(String(e))));
  });
}

/**
 * Spreek `tekst` uit met George. `opVoortgang` krijgt 0..1 over de HELE tekst,
 * gewogen naar de lengte van elk stuk. `opFout` krijgt alleen een fout als er
 * nog NIETS hoorbaar was -- dan kan de beller op een andere stem terugvallen.
 * Faalt een later stuk, dan eindigt AXE netjes (opKlaar) in plaats van
 * midden in een antwoord van stem te wisselen.
 */
export function speakWithKokoro(
  tekst: string,
  { opKlaar, opFout, opVoortgang, opEersteAudio }: {
    opKlaar?: () => void;
    opFout?: (reden: string) => void;
    opVoortgang?: (fractie: number) => void;
    opEersteAudio?: () => void;
  } = {},
): void {
  stopKokoro();
  const mijn = generatie;
  const stukken = splitIntoSpeechChunks(tekst);
  if (!stukken.length) { opKlaar?.(); return; }
  const totaal = stukken.reduce((n, s) => n + s.length, 0);

  void (async () => {
    let gedaan = 0;
    let volgende: Promise<Blob> = haalStuk(stukken[0]);
    for (let i = 0; i < stukken.length; i++) {
      let blob: Blob;
      try {
        blob = await volgende;
      } catch (e) {
        if (mijn !== generatie) return; // gestopt: geen melding
        if (i === 0) opFout?.(e instanceof Error ? e.message : String(e));
        else { opVoortgang?.(1); opKlaar?.(); }
        return;
      }
      if (mijn !== generatie) return;
      // Het volgende stuk alvast laten maken terwijl dit stuk speelt.
      if (i + 1 < stukken.length) {
        volgende = haalStuk(stukken[i + 1]);
        volgende.catch(() => { /* afgehandeld bij de volgende await */ });
      }
      const lengte = stukken[i].length;
      try {
        await speel(blob, (binnen) => opVoortgang?.((gedaan + lengte * binnen) / totaal), mijn, i === 0 ? opEersteAudio : undefined);
      } catch (e) {
        if (mijn !== generatie) return;
        if (i === 0) { opFout?.(e instanceof Error ? e.message : String(e)); return; }
        break;
      }
      if (mijn !== generatie) return;
      gedaan += lengte;
    }
    if (mijn !== generatie) return;
    opVoortgang?.(1);
    opKlaar?.();
  })();
}
