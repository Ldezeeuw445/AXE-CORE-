/**
 * Wat het chatvak zegt als er geen berichten staan -- en als er wel berichten
 * staan maar ze niet bewaard worden.
 *
 * ## Waarom dit bestaat
 *
 * Gemeten 2 okt 2026, op Luka's telefoon-Home: een leeg zwart vlak tussen de
 * agent-tegels en de composer. Het vak zelf is in orde (`MobileChat` toont
 * berichten, lopende agents, "Working..." en de goedkeuringsvraag) -- er was
 * niets om te tonen.
 *
 * Het probleem is dat "niets om te tonen" vier verschillende dingen kan zijn,
 * en dat ze er alle vier identiek uitzagen:
 *
 *   1. een vers gesprek waarin nog niets gezegd is;
 *   2. de app is het gesprek nog aan het ophalen;
 *   3. het ophalen is MISLUKT -- `loadMessages` ving elke fout en gaf `[]`
 *      terug, met alleen een console-regel;
 *   4. het OPSLAAN is stuk -- `chatSaveHealth()` wist dat precies, maar de
 *      enige plek die het toonde was `/status`, en die staat niet in de
 *      telefoonnavigatie.
 *
 * Geval 4 is al eens zes weken onopgemerkt gebeurd (zie de kop van
 * `chatPersistence.ts`): de chat bleef werken, antwoorden bleven komen, en er
 * werd niets vastgelegd. Dat is precies het soort fout dat een app verbergt
 * zolang het enige signaal in de console staat.
 *
 * Op de telefoon is dit vak het ENIGE venster op het gesprek -- geen zijbalk,
 * geen gesprekkenlijst -- dus daar is zwijgen het duurst. Eén component voor
 * beide oppervlakken, zoals `GoedkeuringBlok`, zodat de telefoon en het bureau
 * niet uit elkaar kunnen lopen.
 *
 * ## Waarom de laadfout alleen bij een leeg gesprek komt
 *
 * Mislukte het ophalen maar stond er nog een kopie in localStorage, dan zie je
 * je gesprek -- mogelijk zonder wat je op een ander apparaat zei. Daar een
 * waarschuwing boven elk gesprek voor zetten is ruis die je na een dag niet
 * meer leest. Bij een leeg vak is het geen ruis maar het enige antwoord op
 * "waar is mijn gesprek?".
 *
 * Welke stand wanneer komt staat in `domain/chat/gesprekStand.ts`, met een test
 * per geval. Hier staat alleen hoe hij eruitziet.
 *
 * ## Twee vormen, en waarom `smal` minder zegt
 *
 * Op het bureau staat het gesprek niet in de chatplaat maar in de onzichtbare
 * wolk naast de composer (`AxePresenceDock`): `kopAlleen` in `PlaatChat` is op
 * desktopbreedte vrijwel altijd waar, zoals de uitleg daar zelf zegt. Een
 * melding die alleen in die plaat staat zou dus bijna nooit te zien zijn -- de
 * fout die ik een dag eerder met de Skills-pil in de FAB maakte.
 *
 * Die wolk hoort leeg te zijn als er niets is: daar is "nog niets gezegd" geen
 * antwoord maar zwevende tekst op elke pagina. `smal` zegt daarom alleen wat je
 * moet weten: het wordt niet bewaard, of het kon niet geladen worden.
 *
 * Kleur zit in de woorden, niet in een vlak (wet 10): de achtergrond is
 * zwart-op-lage-alpha, net als de rest van de plaat.
 */
import { useEffect, useState } from 'react';
import { gesprekStand } from '@/domain/chat/gesprekStand';
import { chatLoadHealth, chatSaveHealth } from '@/infrastructure/persistence/chatPersistence';
import { useVoiceStore } from '@/presentation/store/voiceStore';

/** Zelfde tempo als de tegels op /status: deze standen zijn module-state, geen
 *  store, dus er is geen abonnement om op te wachten. */
const POLL_MS = 3_000;

function Regel({ kleur, kop, uitleg, vorm }: { kleur: string; kop: string; uitleg: string; vorm: 'vol' | 'smal' }) {
  if (vorm === 'smal') {
    return (
      <div className="ml-3.5 max-w-full self-start text-[11px] leading-snug">
        <span className="font-semibold" style={{ color: kleur }}>{kop}</span>
        <span style={{ color: 'var(--text-muted)' }}> \u2014 {uitleg}</span>
      </div>
    );
  }
  return (
    <div
      className="mx-2.5 my-2 rounded-lg px-2.5 py-2"
      style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="text-[11px] font-semibold" style={{ color: kleur }}>{kop}</div>
      <div className="mt-0.5 text-[11px] leading-[1.45]" style={{ color: 'var(--text-muted)' }}>{uitleg}</div>
    </div>
  );
}

export function GesprekStand({ vorm = 'vol' }: { vorm?: 'vol' | 'smal' } = {}) {
  const berichten = useVoiceStore((s) => s.conversation.length);
  const laadt = useVoiceStore((s) => s.gesprekLaadt);
  const [opslaan, setOpslaan] = useState(() => chatSaveHealth());
  const [laden, setLaden] = useState(() => chatLoadHealth());

  useEffect(() => {
    const t = setInterval(() => { setOpslaan(chatSaveHealth()); setLaden(chatLoadHealth()); }, POLL_MS);
    return () => clearInterval(t);
  }, []);

  const stand = gesprekStand({
    berichten,
    laadt,
    opslaanOk: opslaan.ok,
    opslaanFouten: opslaan.failures,
    ladenOk: laden.ok,
    ladenGeprobeerd: laden.geprobeerd,
  });

  // In de wolk op het bureau: alleen de twee standen waar iets aan de hand is.
  if (vorm === 'smal' && (stand === 'leeg' || stand === 'laadt')) return null;

  switch (stand) {
    case 'stil':
      return null;

    case 'bewaart-niet':
      return (
        <Regel
          kleur="var(--error)"
          vorm={vorm}
          kop="This conversation is not being saved"
          uitleg={`Saving failed ${opslaan.failures}x${opslaan.lastError ? ` \u2014 ${opslaan.lastError}` : ''}. You can see it, but it is gone when you close the app.`}
        />
      );

    case 'laadt':
      return (
        <Regel
          kleur="var(--text-secondary)"
          vorm={vorm}
          kop="Loading your conversation\u2026"
          uitleg="What you said on your other devices appears here in a moment."
        />
      );

    case 'niet-geladen':
      return (
        <Regel
          kleur="var(--warning)"
          vorm={vorm}
          kop="Could not load your conversation"
          uitleg={`${laden.lastError ?? 'Unknown error'}. You can still talk to AXE, but your older messages are not here yet.`}
        />
      );

    case 'leeg':
      // Geen opgewekte zin over een leeg vak: één regel die zegt wat hier komt.
      return (
        <Regel
          kleur="var(--text-secondary)"
          vorm={vorm}
          kop="Nothing said yet"
          uitleg="AXE's replies appear here, with the agent he puts on it."
        />
      );
  }
}
