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
 */
import { useRef, type ReactNode, type KeyboardEvent } from 'react';
import { ComposerSnelacties } from './ComposerSnelacties';

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
  /** Bovenaan buiten het vak: model, persona, en wat er rechts bij hoort. */
  kop?: ReactNode;
}

export function AxeComposerVak({
  waarde,
  opWaarde,
  opVerstuur,
  plaatshouder = 'Ask anything, @models, /prompts …',
  links,
  rechts,
  staf,
  snelacties = false,
  kop,
}: Props) {
  const veld = useRef<HTMLTextAreaElement>(null);

  const opToets = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+enter is de enige manier om een tweede regel te maken zolang enter
    // verstuurt. Zonder deze uitzondering is een textarea een dure input.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      opVerstuur();
    }
  };

  return (
    <div className="axe-composer axe-vakcomposer flex-shrink-0">
      {kop && <div className="axe-vak-kop">{kop}</div>}

      <div className="axe-vak">
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

      {snelacties && (
        <ComposerSnelacties
          onKies={(prompt) => {
            opWaarde(waarde ? `${waarde.trimEnd()} ${prompt}` : prompt);
            veld.current?.focus();
          }}
        />
      )}
    </div>
  );
}
