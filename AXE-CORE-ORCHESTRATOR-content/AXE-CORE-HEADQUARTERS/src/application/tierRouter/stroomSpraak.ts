/**
 * Zin-voor-zin TTS terwijl de LLM nog tokens stuurt.
 * De eerste complete zin gaat naar George (of de gekozen motor) zonder
 * te wachten op de rest. Barge-in blijft stopGlobalTts.
 */
import { nieuweSpraakStukken } from '@/domain/speechChunks';
import { sanitizeForSpeech, spreekStuk } from '@/infrastructure/gateways/globalTts';

export interface SpraakStroomDeps {
  /** Promise lost tot het stuk KLAAR is. `onStart` vuurt bij het eerste hoorbare sample. */
  spreek: (stuk: string, onStart?: () => void) => Promise<void>;
  onFirstAudio?: () => void;
  onDone?: () => void;
  onError?: (reden: string) => void;
}

export interface SpraakStroom {
  voer: (partial: string) => void;
  sluit: () => void;
  stop: () => void;
}

export function startSpraakStroom(deps: SpraakStroomDeps): SpraakStroom {
  const wacht: string[] = [];
  let gezegd = 0;
  let open = true;
  let pompBezig = false;
  let gestopt = false;
  let hoordeEerste = false;
  let laatste = '';

  const pomp = async (): Promise<void> => {
    if (pompBezig) return;
    pompBezig = true;
    try {
      while (!gestopt && (wacht.length > 0 || open)) {
        const stuk = wacht.shift();
        if (!stuk) {
          if (!open) break;
          await new Promise((r) => setTimeout(r, 12));
          continue;
        }
        try {
          await deps.spreek(stuk, () => {
            if (!hoordeEerste) {
              hoordeEerste = true;
              deps.onFirstAudio?.();
            }
          });
        } catch (e) {
          if (gestopt) return;
          if (!hoordeEerste) {
            deps.onError?.(e instanceof Error ? e.message : String(e));
            return;
          }
          break;
        }
      }
      if (!gestopt) deps.onDone?.();
    } finally {
      pompBezig = false;
    }
  };

  const neem = (tekst: string, afgerond: boolean) => {
    if (gestopt) return;
    const schoon = sanitizeForSpeech(tekst);
    laatste = schoon;
    const { stukken, tot } = nieuweSpraakStukken(gezegd, schoon, afgerond);
    gezegd = tot;
    for (const s of stukken) wacht.push(s);
    void pomp();
  };

  return {
    voer: (partial) => neem(partial, false),
    sluit: () => {
      open = false;
      if (laatste) neem(laatste, true);
      else void pomp();
    },
    stop: () => {
      gestopt = true;
      open = false;
      wacht.length = 0;
    },
  };
}

/** Live pad: George (of de gekozen motor), type-mode slaat over. */
export function startAxeSpraakStroom(opts: {
  onFirstAudio?: () => void;
  onDone?: () => void;
  onError?: (reden: string) => void;
}): SpraakStroom {
  try {
    if (localStorage.getItem('axe_response_mode') === 'type') {
      return { voer: () => {}, sluit: () => opts.onDone?.(), stop: () => {} };
    }
  } catch { /* ignore */ }
  return startSpraakStroom({
    spreek: (stuk, onStart) => spreekStuk(stuk, onStart),
    onFirstAudio: opts.onFirstAudio,
    onDone: opts.onDone,
    onError: opts.onError,
  });
}
