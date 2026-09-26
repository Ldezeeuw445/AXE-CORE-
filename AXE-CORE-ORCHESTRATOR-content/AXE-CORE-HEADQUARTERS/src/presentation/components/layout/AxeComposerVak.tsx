/**
 * De composer: één vak, niet gestapeld.
 *
 * ## Wat er anders is
 *
 * Hij was een pil: één rij, waarin het invoerveld, zes icoonknoppen en de
 * verstuurknop om dezelfde horizontale ruimte vochten. Op een smal venster
 * kneep dat het veld tot ~150px, en boven de pil stond nóg een vlak (de
 * chatplaat) met zijn eigen rand en hoeken -- twee losse dozen boven elkaar.
 *
 * Uit het voorbeeld: één afgeronde rechthoek met twee lagen ERIN. Bovenin waar
 * je typt, met alle ruimte; onderin een rij gereedschap. De knoppen vechten
 * dus niet meer met de tekst, want ze staan er niet naast maar onder.
 *
 * ## Waarom een textarea en geen input
 *
 * Het vak is hoog. Een <input> blijft één regel en zet je tekst midden in een
 * leeg vlak; een textarea vult hem. En het is wat je wilt: een prompt is vaak
 * meer dan een regel. Enter verstuurt nog steeds, shift+enter maakt een regel
 * -- anders kun je nooit een tweede regel typen.
 *
 * ## Waarom de klassen blijven zoals ze zijn
 *
 * `axe-composer` blijft erop staan. AxeShellChrome MEET dat element om
 * --axe-composer-onder en --axe-composer-hoog te zetten, en de panelen naast
 * de chat hangen daaraan. Een nieuwe klassenaam zou de meting stil op nul
 * zetten en dan staan Terrain en Neural weer verkeerd.
 *
 * ## Waarom `kop` NU een kind is van `.axe-vak`, en niet ervoor
 *
 * Corrective round 5: `kop` stond hiervoor tussen `.axe-composer` en de
 * `BorderBeam`/`.axe-vak` in -- een BROER van het vak, zonder eigen
 * achtergrond of rand. Precies die constructie was waarom deze plek steeds
 * terugkwam met z-index-lapmiddelen (ronde 1 Fix 5): een los zwevend
 * strookje kan altijd door iets erachter geraakt worden of ervoor gaan staan.
 *
 * Nu is `kop` de EERSTE rij BINNEN `.axe-vak`, boven `.axe-vak-boven`. Er is
 * geen apart vlak meer om achter te verdwijnen -- het is dezelfde kaart, met
 * dezelfde achtergrond, rand en hoeken, gewoon een regel hoger. `.axe-vak`
 * groeit vanzelf mee: hij is een flex-kolom met een gap tussen zijn kinderen,
 * dus deze rij krijgt ruimte zonder dat er iets aan zijn eigen opmaak hoeft
 * te veranderen.
 *
 * `paneel` is de uitzondering: het gesprekken/status-paneel achter de
 * klok-knop in `kop` moet BOVEN het vak kunnen verschijnen als uitklap, niet
 * ERIN -- anders duwt hij bij het openen het invoerveld omlaag. Die blijft
 * daarom een aparte, absoluut gepositioneerde laag naast (niet in) `.axe-vak`,
 * verankerd op de BOVENkant van het vak (zie `.axe-kop-paneel` in
 * axe-look.css). Zijn eigen inhoud is ongewijzigd; alleen waar hij hangt is
 * nieuw.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent, type ClipboardEvent } from 'react';
import { VoiceBeam } from 'voice-glow';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { AxeAgentsBalk } from '@/presentation/components/layout/AxeAgentsBalk';
import { getGlobalTtsLevel } from '@/infrastructure/gateways/globalTts';
import { getActiveMicStream, getMicLevel, subscribeMicStream } from '@/infrastructure/gateways/whisperService';
import { useAudioActivity } from '@/presentation/hooks/useAudioActivity';
import { ComposerSnelacties } from './ComposerSnelacties';
import type { Snelactie } from '@/domain/snelacties';

interface Props {
  waarde: string;
  opWaarde: (t: string) => void;
  opVerstuur: () => void;
  plaatshouder?: string;
  /** Het gereedschap linksonder in het vak. */
  links?: ReactNode;
  /** Rechtsonder: opnemen, microfoon, versturen. */
  rechts?: ReactNode;
  /** Rechtsboven, over de tekst: de toverstaf uit het voorbeeld. */
  staf?: ReactNode;
  /** De pillen eronder. Laat ze weg op een paneel-composer; daar is geen plek. */
  snelacties?: boolean;
  /** Een eigen rij, bijvoorbeeld die van de Code Editor. Leeg = de rij van Home. */
  snelactieLijst?: readonly Snelactie[];
  /** De koprij BINNEN het vak: model, persona, en wat er rechts bij hoort --
   *  zie de uitleg hierboven waarom dit sinds ronde 5 in `.axe-vak` zit. */
  kop?: ReactNode;
  /** Het gesprekken/status-paneel achter de klok-knop in `kop`. Rendert als
   *  overlay BOVEN het vak (zie axe-look.css), niet als extra rij erin --
   *  anders schuift het invoerveld omlaag zodra je hem openklapt. */
  paneel?: ReactNode;
  /** Mobile Home already shows the six primary agents around the sphere. */
  toonAgentsBalk?: boolean;
}

/* De lichtrand loopt alleen als AXE iets doet.
 *
 * Altijd laten lopen maakt er behang van: dan zegt hij niets meer en trekt hij
 * de hele avond aandacht. Nu is de rand het antwoord op "hoort hij me?" -- hij
 * gaat lopen zodra er geluisterd, gedacht of gesproken wordt, en staat stil als
 * AXE stilstaat. Dezelfde bron als de orbs, dus ze kunnen niet uit de pas. */
export function AxeComposerVak({
  waarde,
  opWaarde,
  opVerstuur,
  plaatshouder = 'Ask anything, @models, /prompts …',
  links,
  rechts,
  staf,
  snelacties = false,
  snelactieLijst,
  kop,
  paneel,
  toonAgentsBalk = true,
}: Props) {
  const veld = useRef<HTMLTextAreaElement>(null);
  const status = useVoiceStore(s => s.voiceStatus);
  // The live interim/final transcript SpeechRecognition already produces
  // while Luka talks (see startListening in voiceStore.ts) -- it was sitting
  // in the store unused by any UI. Showing it here is the "see my own words
  // as I talk" ask: no new STT work, just wiring what already exists.
  const transcript = useVoiceStore(s => s.transcript);
  const rawError = useVoiceStore(s => s.error);
  const micError = rawError && /microphone|mic |audio-capture|notallowed|permission denied|getusermedia/i.test(rawError)
    ? rawError
    : null;
  const stopListening = useVoiceStore(s => s.stopListening);
  const [micStream, setMicStream] = useState<MediaStream | null>(() => getActiveMicStream());
  const isListening = status === 'listening';
  const isProcessing = status === 'processing';
  const presence = useAudioActivity(
    status === 'listening' ? micStream : null,
    status === 'speaking' ? getGlobalTtsLevel : undefined,
  );

  // Eén stream: Whisper opent hem vanuit de klik, VoiceBeam leest hem alleen.
  // Geen tweede getUserMedia vanuit useEffect — in WKWebView blijft die stil.
  useEffect(() => subscribeMicStream(setMicStream), []);

  const hangListenOp = () => {
    if (status !== 'idle') stopListening();
  };

  const opToets = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isListening && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const typt = e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter';
      if (typt) {
        hangListenOp();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          opVerstuur();
          return;
        }
        if (e.key.length === 1) {
          opWaarde(waarde + e.key);
          e.preventDefault();
        }
      }
    }
    // Shift+enter is de enige manier om een tweede regel te maken zolang enter
    // verstuurt. Zonder deze uitzondering is een textarea een dure input.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      opVerstuur();
    }
  };

  const opPlak = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!isListening) return;
    e.preventDefault();
    hangListenOp();
    opWaarde(waarde + e.clipboardData.getData('text'));
  };

  const presenceStyle = {
    '--axe-voice-alpha': Math.min(0.78, presence.mix * 0.78).toFixed(3),
    '--axe-voice-alpha-soft': Math.min(0.39, presence.mix * 0.39).toFixed(3),
    '--axe-voice-spread': `${Math.round(12 + presence.mix * 34)}px`,
    '--axe-voice-spread-soft': `${Math.round(18 + presence.mix * 48)}px`,
  } as CSSProperties;

  return (
    <div
      className="axe-composer axe-vakcomposer flex-shrink-0"
      data-axe-doel="axe-composer"
      data-voice-energy={presence.mix > 0.015 ? 'on' : 'off'}
      style={presenceStyle}
    >
      {toonAgentsBalk && <AxeAgentsBalk />}
      {/* One light around the composer, and it is the voice (Luka, 23 sep
          2026: "alleen deze erin, dat is rustiger en reageert op echt axe of
          ik, dat is realistischer"). The border beam is gone -- a decoration
          that ran regardless of what was happening. This glow breathes slowly
          at rest (idle 0.7, 5 s) and answers real sound only: Luka's mic while
          he talks (`stream`), AXE's actual TTS playback while AXE talks
          (`level`). No `processing` sweep any more (23 sep, second ask: "geen
          processing meer doorheen"): while AXE thinks it simply breathes, and
          it only moves for real sound.

          The look is his libraries.dev playground export taken literally:
          sensitivity 4, threshold 0.055, attack 0.5, breatheDuration 5, bands
          off, idle 0.7, reach 2.25, brightness 1.1 (all checked in voice-glow
          0.2.1's dist/index.d.ts). Everything he did not set is back on the
          library default. `active` is left at its default (on): with the beam
          gone, this is the only light, so it must not switch off at rest. */}
      <VoiceBeam
        stream={status === 'listening' ? micStream : null}
        level={status === 'speaking' ? getGlobalTtsLevel : status === 'listening' ? getMicLevel : 0}
        processing={isProcessing}
        sensitivity={4}
        threshold={0.055}
        attack={0.5}
        breatheDuration={5}
        bands={false}
        idle={0.7}
        reach={2.25}
        brightness={1.1}
        theme="dark"
      >
      <div className="axe-vak">
        {/* De koprij zit NU in het vak zelf (ronde 5) -- zie de uitleg
            bovenin dit bestand. Dezelfde kaart, gewoon een regel hoger. */}
        {kop && <div className="axe-vak-kop">{kop}</div>}

        <div className="axe-vak-boven">
          <textarea
            ref={veld}
            /* While listening, show the live SpeechRecognition transcript
               instead of `waarde` -- startListening() in voiceStore.ts sends
               the final transcript straight to sendMessage() and never
               touches `chatText`, so without this branch Luka's own words
               never appeared here while he was still talking. Read-only in
               this state: the visible text is being replaced every partial
               result, so typing into it would fight the transcription. */
            value={isListening ? transcript : waarde}
            onChange={e => opWaarde(e.target.value)}
            onKeyDown={opToets}
            onPaste={opPlak}
            readOnly={isListening}
            placeholder={isListening ? 'Listening…' : plaatshouder}
            rows={2}
            spellCheck={false}
            className="axe-vak-invoer"
            data-axe-luistert={isListening ? 'ja' : 'nee'}
          />
          {staf && <div className="axe-vak-staf">{staf}</div>}
        </div>

        {micError && (
          <p className="px-1 text-[10px] leading-snug" style={{ color: 'var(--error)' }} role="alert">
            {micError}
          </p>
        )}

        <div className="axe-vak-rij">
          <div className="axe-vak-links">{links}</div>
          <div className="axe-vak-rechts">{rechts}</div>
        </div>
      </div>
      </VoiceBeam>

      {/* Uitzondering op "alles in het vak": dit paneel klapt UIT boven het
          vak, dus hij mag geen extra flex-rij zijn -- position:absolute in
          axe-look.css (bottom:100% op `.axe-composer`) tilt hem los van de
          flow en zet hem precies op de bovenkant van `.axe-vak` (zie de
          uitleg bovenin dit bestand). */}
      {paneel}

      {snelacties && (
        <ComposerSnelacties
          acties={snelactieLijst}
          onKies={(prompt) => {
            opWaarde(waarde ? `${waarde.trimEnd()} ${prompt}` : prompt);
            veld.current?.focus();
          }}
        />
      )}
    </div>
  );
}
