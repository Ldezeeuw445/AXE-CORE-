/**
 * Waar AXE mee denkt, te wisselen vanaf de plek waar je het antwoord leest.
 *
 * ## Waarom in de chatbalk en niet alleen in Settings
 *
 * De keuze gaat over dít gesprek: zwaarder model voor een lastige vraag,
 * goedkoper voor een snelle. In Settings is diezelfde keuze een lijst zonder
 * context -- je ziet niet wat er net misging, dus je weet niet waarom je zou
 * wisselen. Hier staat hij naast het antwoord dat aanleiding geeft.
 *
 * Onder elk AXE-antwoord stond al `provider · model`. Dat vertelde je WAT het
 * werd; dit maakt er een knop van.
 *
 * ## Wat het schrijft
 *
 * Het primaire slot in voiceStore, dezelfde plek die Settings gebruikt. Niet een
 * tweede voorkeur ernaast -- twee plekken die hetzelfde instellen gaan het ooit
 * oneens zijn, en dan zegt het scherm iets anders dan er draait.
 *
 * De sleutel komt uit de opgeslagen verbinding van die provider, niet uit het
 * slot dat er stond. Wissel je van provider en neem je de oude sleutel mee, dan
 * stuur je de sleutel van de een naar de ander -- die faalt, en de melding wijst
 * naar het model in plaats van naar de sleutel.
 */
import { useState, useMemo, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { PROVIDERS, type ProviderId } from '@/domain/providers';
import {
  chatModelKeuzes, isActief, modelLabel, merkenMetKeuzes, keuzesVanMerk,
  actiefMerk, MERK_LABEL, MERK_UITLEG, leesVerbindingen,
  type ChatModelKeuze, type Merk,
} from '@/domain/chatModelKeuzes';

/**
 * `variant='stip'`: alleen het groene bolletje met een gloed eromheen.
 *
 * Boven de composer staat links AXE CORE; de modelnaam eronder maakte die regel
 * druk terwijl je hem zelden leest. Het bolletje zegt "er staat iets aan" en
 * geeft op klik dezelfde keuze als altijd. De naam zit in de tooltip, dus hij
 * is er nog voor wie hem zoekt.
 */
export function ChatModelKiezer({ variant = 'pil' }: { variant?: 'pil' | 'stip' } = {}) {
  const primair = useVoiceStore(s => s.primarySlot);
  const setPrimair = useVoiceStore(s => s.setPrimarySlot);
  const [open, setOpen] = useState(false);
  const [merk, setMerk] = useState<Merk | null>(null);
  const wortel = useRef<HTMLSpanElement | null>(null);
  /* Corrective (evaluator round 1, issue 1): meten of er boven de knop ruimte
   * is, was nooit het echte probleem -- de knop zit BINNEN `AxeComposerVak`'s
   * `BorderBeam`/`VoiceBeam`-omhulsels, en beide zetten `overflow: hidden` op
   * hun eigen wrapper (`voice-glow`'s `index.es.js` doet dit altijd;
   * `border-beam` doet het voor `pulse-inner`, wat de composer nu gebruikt --
   * zie AxeComposerVak.tsx). Een `position: absolute` paneel, hoe goed
   * gemeten ook, wordt geknipt zodra het over de rand van díe wrapper heen
   * wil, ongeacht `boven`/`maxHoogte`: gemeten in de app, 1440×900, bleef er
   * van een paneel dat op y 419–610 hoorde te staan maar 13px zichtbaar.
   *
   * Dus: de metingen hieronder blijven (ze bepalen nog steeds boven/onder en
   * de maximale hoogte), maar het PANEEL ZELF rendert via een portal naar
   * `document.body`, `position: fixed`, met zijn eigen `left`/`top`-of-
   * `bottom` uit dezelfde meting -- buiten beide omhulsels, dus niets van hen
   * kan het nog knippen. */
  const [plek, setPlek] = useState<{ boven: boolean; maxHoogte: number; left: number; verticaal: number }>(
    { boven: true, maxHoogte: 256, left: 0, verticaal: 0 },
  );
  useLayoutEffect(() => {
    if (!open || !wortel.current) return;
    const meet = () => {
      const r = wortel.current!.getBoundingClientRect();
      const RAND = 12; // lucht tot de vensterrand, zelfde soort marge als elders in de schil
      const ruimteBoven = r.top - RAND;
      const ruimteOnder = window.innerHeight - r.bottom - RAND;
      // Boven blijft de voorkeur (past bij de compositie: het paneel hoort bij
      // de knop erboven, niet er middenin) -- alleen omlaaien als boven het
      // écht niet past én onder aantoonbaar meer ruimte heeft.
      const boven = ruimteBoven >= 160 || ruimteBoven >= ruimteOnder;
      const PANEEL_BREEDTE = 300;
      // Links uitgelijnd op de knop, maar nooit voorbij de rechterrand van
      // het venster -- de knop zit vaak dicht bij de rand van de composer.
      const left = Math.min(r.left, window.innerWidth - PANEEL_BREEDTE - RAND);
      // `fixed`-coördinaat vanaf de bovenkant (open onder) of vanaf de
      // onderkant (open boven, zelfde `bottom: 100% + gap` gevoel als de
      // oude `absolute`-versie, nu alleen tegen het venster in plaats van
      // tegen de (geknipte) ouder).
      const verticaal = boven ? window.innerHeight - r.top + 4 : r.bottom + 4;
      setPlek({ boven, maxHoogte: Math.max(120, Math.min(360, boven ? ruimteBoven : ruimteOnder)), left, verticaal });
    };
    meet();
    window.addEventListener('resize', meet);
    window.addEventListener('scroll', meet, true);
    return () => {
      window.removeEventListener('resize', meet);
      window.removeEventListener('scroll', meet, true);
    };
  }, [open]);

  // Bij het openen opnieuw lezen: heb je net in Settings een sleutel ingevuld,
  // dan hoort die provider hier meteen te staan.
  const keuzes = useMemo(
    () => (open ? chatModelKeuzes(leesVerbindingen(), PROVIDERS.map(p => p.id)) : []),
    [open],
  );
  const merken = useMemo(() => merkenMetKeuzes(keuzes), [keuzes]);
  const huidigMerk = actiefMerk(primair);
  // Bij openen begin je bij het merk dat nu draait -- niet bij een leeg scherm
  // waarop je eerst moet herontdekken waar je was.
  const getoondMerk: Merk = merk ?? huidigMerk;

  const kies = useCallback((k: ChatModelKeuze) => {
    const conns = leesVerbindingen();
    setPrimair({
      provider: k.provider,
      key: conns[k.provider]?.key ?? '',
      model: k.model,
    });
    setOpen(false); setMerk(null);
  }, [setPrimair]);

  /* AXE Native = geen primair slot. Dat is niet "niets instellen" maar een
     echte stand: de cascade kiest dan zelf op basis van wat je vraagt, wat het
     gedrag was voordat deze knop bestond. */
  const kiesNative = useCallback(() => {
    setPrimair(null);
    setOpen(false); setMerk(null);
  }, [setPrimair]);

  const huidigLabel = primair
    ? modelLabel(primair.provider, primair.model || '')
    : MERK_LABEL.native;

  return (
    <span className="relative" ref={wortel}>
      {variant === 'stip' ? (
        <button
          onClick={() => { setOpen(v => !v); setMerk(null); }}
          title={`${huidigLabel} — waar AXE mee denkt; geldt vanaf je volgende bericht`}
          aria-label={`Model: ${huidigLabel}`}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 22, height: 22,
            background: 'rgba(52,211,153,0.10)',
            border: '1px solid rgba(52,211,153,0.35)',
            boxShadow: '0 0 12px rgba(52,211,153,0.45)',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: '#34D399', boxShadow: '0 0 8px rgba(52,211,153,0.9)' }} />
        </button>
      ) : (
      <button
        onClick={() => { setOpen(v => !v); setMerk(null); }}
        title="Waar AXE mee denkt — geldt vanaf je volgende bericht"
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
      >
        {huidigLabel}
        <ChevronDown size={9} />
      </button>
      )}

      {open && createPortal(
        <>
          {/* Klik ernaast sluit hem. Zonder dit blijft hij open zodra je iets
              anders doet, en dan dekt hij het gesprek af. */}
          <span className="fixed inset-0 z-40" onClick={() => { setOpen(false); setMerk(null); }} />
          {/* `position: fixed` uit de eigen meting hierboven, geportaald tot
              buiten `AxeComposerVak`'s BorderBeam/VoiceBeam-omhulsels -- zie
              de uitleg bij `plek` hierboven. `left-0`/`bottom-full` van de
              oude `absolute`-versie zijn hier vervangen door de gemeten
              `left`/`top`-of-`bottom` in pixels. */}
          <div
            className="fixed z-50 rounded-card overflow-hidden flex flex-col"
            style={{
              left: plek.left,
              [plek.boven ? 'bottom' : 'top']: plek.verticaal,
              width: 300,
              maxHeight: plek.maxHoogte,
              background: 'var(--bg-panel, rgba(12,16,24,0.98))',
              border: '1px solid var(--border-default)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            }}
          >
            {/* ── Stap 1: wie ───────────────────────────────────────────── */}
            <div className="flex gap-1 p-1.5" style={{ borderBottom: '1px solid var(--border-default)' }}>
              {merken.map(m => {
                const aan = m === getoondMerk;
                return (
                  <button
                    key={m}
                    onClick={() => (m === 'native' ? kiesNative() : setMerk(m))}
                    title={MERK_UITLEG[m]}
                    className="text-[10px] px-2 py-1 rounded-card flex-1"
                    style={{
                      border: `1px solid ${aan ? 'var(--border-active)' : 'transparent'}`,
                      background: aan ? 'var(--bg-active)' : 'transparent',
                      color: aan ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    }}
                  >
                    {MERK_LABEL[m]}
                    {m === huidigMerk && <span style={{ color: 'var(--m-happened)' }}> ●</span>}
                  </button>
                );
              })}
            </div>

            {/* ── Stap 2: welk model ────────────────────────────────────── */}
            {getoondMerk === 'native' ? (
              <div className="px-3 py-2.5 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {MERK_UITLEG.native}. Geen vaste keuze — AXE zet per vraag het
                model vooraan dat er het best bij past.
              </div>
            ) : (
              // flex-1/min-h-0 in plaats van een vaste max-h-64: de OUTER laag
              // hierboven kent al de echte gemeten ruimte (`plek.maxHoogte`);
              // een tweede, vaste cap hier zou op een laag venster nog steeds
              // voorbij die gemeten grens kunnen lopen.
              <div className="flex-1 min-h-0 overflow-y-auto">
                {keuzesVanMerk(keuzes, getoondMerk).map(k => {
                  const aan = isActief(k, primair);
                  return (
                    <button
                      key={`${k.provider}:${k.model}`}
                      onClick={() => kies(k)}
                      className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-white/5"
                    >
                      <span style={{ width: 12, flexShrink: 0, paddingTop: 2 }}>
                        {aan && <Check size={10} style={{ color: 'var(--accent-cyan)' }} />}
                      </span>
                      <span className="min-w-0">
                        <span className="text-[11px]"
                          style={{ color: aan ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                          {k.label}
                        </span>
                        <span className="text-[9px] block truncate" style={{ color: 'var(--text-muted)' }}>
                          {k.toelichting}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}

export type { ProviderId };
