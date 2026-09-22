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
import { useRef, type ReactNode, type KeyboardEvent } from 'react';
import { BorderBeam } from 'border-beam';
import { useVoiceStore } from '@/presentation/store/voiceStore';
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
}: Props) {
  const veld = useRef<HTMLTextAreaElement>(null);
  const status = useVoiceStore(s => s.voiceStatus);
  const bezig = status !== 'idle';

  const opToets = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+enter is de enige manier om een tweede regel te maken zolang enter
    // verstuurt. Zonder deze uitzondering is een textarea een dure input.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      opVerstuur();
    }
  };

  return (
    <div className="axe-composer axe-vakcomposer flex-shrink-0" data-axe-doel="axe-composer">
      {/* Altijd aan, zacht in rust en voller zodra AXE werkt. Stond op
          active={bezig}: dan bewoog hij alleen tijdens een antwoord, en in rust
          was er niets van te zien -- terwijl Luka hem juist rustig zichtbaar
          wilde (16 september). */}
      <BorderBeam size="pulse-outside" colorVariant="colorful" strength={bezig ? 1 : 0.75} active>
      <div className="axe-vak">
        {/* De koprij zit NU in het vak zelf (ronde 5) -- zie de uitleg
            bovenin dit bestand. Dezelfde kaart, gewoon een regel hoger. */}
        {kop && <div className="axe-vak-kop">{kop}</div>}

        <div className="axe-vak-boven">
          <textarea
            ref={veld}
            value={waarde}
            onChange={e => opWaarde(e.target.value)}
            onKeyDown={opToets}
            placeholder={plaatshouder}
            rows={2}
            spellCheck={false}
            className="axe-vak-invoer"
          />
          {staf && <div className="axe-vak-staf">{staf}</div>}
        </div>

        <div className="axe-vak-rij">
          <div className="axe-vak-links">{links}</div>
          <div className="axe-vak-rechts">{rechts}</div>
        </div>
      </div>
      </BorderBeam>

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
