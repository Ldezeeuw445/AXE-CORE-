/**
 * De microfoon. Eén stream, en hoe hard je erin praat.
 *
 * Dit bestand heette zo omdat het Whisper deed: opnemen, stilte detecteren,
 * en naar Groq of OpenAI sturen voor transcriptie. Die helft is weg. Op
 * 29 september 2026 koos Luka één spraakpad -- OpenAI Realtime, spraak naar
 * spraak, geen stille terugval (`ba4ac856`) -- en daarmee had de opnamelus
 * geen enkele aanroeper meer. Hij stond er nog 290 regels lang.
 *
 * Wat overblijft is wat de realtime-sessie en de UI werkelijk gebruiken: één
 * microfoonstream die niemand tweemaal opent, en het niveau waarmee de orb en
 * de composer meebewegen.
 *
 * **Dat niveau was stuk.** `lastRms` werd alleen bijgewerkt binnen de
 * opnamelus, dus sinds die lus niet meer draait gaf `getMicLevel()` altijd 0
 * terug en bewoog de orb niet meer als je praatte. De analyser hangt nu aan
 * de stream zelf, dus hij werkt zolang de microfoon open is -- ongeacht wie
 * hem heeft.
 */

let mediaStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let meetData: Uint8Array<ArrayBuffer> | null = null;
let rafId = 0;
let lastRms = 0;

type StreamListener = (stream: MediaStream | null) => void;
const streamListeners = new Set<StreamListener>();

function notifyStream(): void {
  for (const cb of streamListeners) {
    try {
      cb(mediaStream);
    } catch {
      /* een luisteraar die valt mag de microfoon niet meeslepen */
    }
  }
}

export function getActiveMicStream(): MediaStream | null {
  return mediaStream;
}

/** Live 0..1 RMS van de microfoon, gelezen door de orb en de composer. */
export function getMicLevel(): number {
  return Math.min(1, lastRms * 12);
}

export function subscribeMicStream(cb: StreamListener): () => void {
  streamListeners.add(cb);
  cb(mediaStream);
  return () => {
    streamListeners.delete(cb);
  };
}

/**
 * De meter aan de stream hangen.
 *
 * WKWebView (Tauri op macOS) start een AudioContext in 'suspended'. Zonder
 * resume() blijft de RMS op 0 -- dat kostte eerder al een dag zoeken, dus de
 * resume staat er nog.
 */
function startMeter(stream: MediaStream): void {
  stopMeter();
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
    void audioCtx.resume().catch(() => {});
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    meetData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const tik = () => {
      if (!analyser || !meetData) return;
      analyser.getByteTimeDomainData(meetData);
      let som = 0;
      for (const v of meetData) { const x = (v - 128) / 128; som += x * x; }
      lastRms = Math.sqrt(som / meetData.length);
      rafId = requestAnimationFrame(tik);
    };
    rafId = requestAnimationFrame(tik);
  } catch {
    // Geen meter is vervelend, geen microfoon is erger: laat de stream staan.
    stopMeter();
  }
}

function stopMeter(): void {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  analyser = null;
  meetData = null;
  void audioCtx?.close().catch(() => {});
  audioCtx = null;
  lastRms = 0;
}

function cleanupTracks(): void {
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  notifyStream();
}

/** Eén mic-stream voor het hele gesprek. Tweemaal openen is tweemaal vragen. */
export async function acquireMic(): Promise<MediaStream> {
  if (mediaStream?.getAudioTracks().some((t) => t.readyState === 'live')) {
    return mediaStream;
  }
  stopMeter();
  cleanupTracks();
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  startMeter(mediaStream);
  notifyStream();
  return mediaStream;
}

/** Tracks stoppen -- einde gesprek, of fout. */
export function releaseMic(): void {
  stopMeter();
  cleanupTracks();
}
