/**
 * Interview (BOUWLIJST, Spazio-hoek, 25 nov): AXE leert wie Luka is via een
 * geleid gesprek.
 *
 *   "interview me" / "leer me kennen"   -> vraag 1
 *   elk volgend bericht                   -> antwoord op de open vraag, dan de volgende
 *   "sla over"                            -> volgende vraag, niets opgeslagen
 *   "stop interview"                      -> pauze; "ga verder met het interview" pakt het op
 *
 * De antwoorden komen in het gedeelde geheugen (I/O in application/axe/profiel.ts)
 * en staan daarna in elke chat-prompt als "Wie Luka is". Deterministisch: geen
 * model nodig om een vraag te stellen of een antwoord te bewaren. Geen I/O hier.
 */

export interface Vraag {
  id: string;
  vraag: string;
  /** Kop in de systeemprompt. */
  kop: string;
}

export const VRAGEN: readonly Vraag[] = [
  { id: 'werk', kop: 'Werk', vraag: 'Wat doe je, in een paar zinnen, en waar verdien je nu je geld mee?' },
  { id: 'doel', kop: 'Doel dit jaar', vraag: 'Wat moet er over een jaar echt staan? Eén ding is genoeg.' },
  { id: 'projecten', kop: 'Projecten op volgorde', vraag: 'Welke projecten zijn het belangrijkst, op volgorde? (AXE CORE, NorthSea, Trading OS, iets anders?)' },
  { id: 'dag', kop: 'Een goede dag', vraag: 'Hoe ziet een goede werkdag eruit: wanneer begin je, wanneer ben je het scherpst, wanneer stop je?' },
  { id: 'stijl', kop: 'Hoe AXE praat', vraag: 'Hoe wil je dat ik met je praat? Kort en direct, uitgebreid, Nederlands of Engels, grapjes of niet?' },
  { id: 'storen', kop: 'Wanneer storen', vraag: 'Waarvoor mag ik je altijd storen, en waarvoor nooit?' },
  { id: 'grenzen', kop: 'Nooit zonder vragen', vraag: 'Wat mag ik nooit doen zonder het eerst te vragen?' },
  { id: 'energie', kop: 'Energie', vraag: 'Waar krijg je energie van, en wat vreet energie?' },
  { id: 'mensen', kop: 'Belangrijke mensen', vraag: 'Wie zijn de mensen die ik moet kennen (zakelijk of privé), en wat zijn ze voor je?' },
  { id: 'anders', kop: 'Verder', vraag: 'Is er iets wat ik over je moet weten dat ik niet gevraagd heb?' },
];

export const PROFIEL_CATEGORIE = 'luka_profiel';
export const PROFIEL_PREFIX = 'profiel:';

export type InterviewActie = 'start' | 'verder' | 'stop' | 'overslaan';

const START = /^(?:axe[,\s]+)?(?:interview\s+me|(?:start|begin|doe)\s+(?:het\s+|een\s+|the\s+|an\s+)?interview|leer\s+me\s+(?:beter\s+)?kennen|get\s+to\s+know\s+me|stel\s+(?:me\s+)?vragen\s+over\s+mij(?:zelf)?)\s*[.!]*$/i;
const VERDER = /^(?:axe[,\s]+)?(?:ga\s+(?:verder|door)\s+met\s+(?:het\s+)?interview|(?:resume|continue)\s+(?:the\s+)?interview)\s*[.!]*$/i;
const STOP = /^(?:axe[,\s]+)?(?:stop(?:\s+(?:het|met\s+het|the))?\s+interview|pauzeer\s+(?:het\s+)?interview|stop\s+interviewing)\s*[.!]*$/i;
const OVERSLAAN = /^(?:sla\s+(?:deze\s+)?over|skip(?:\s+this)?|volgende(?:\s+vraag)?|next(?:\s+question)?|weet\s+ik\s+niet|geen\s+idee|pass)\s*[.!]*$/i;

/** Een opdracht over het interview, los van of er één loopt. */
export function interviewOpdracht(tekst: string): InterviewActie | null {
  const t = (tekst ?? '').trim().replace(/\s+/g, ' ');
  if (!t || t.length > 60) return null;
  if (STOP.test(t)) return 'stop';
  if (VERDER.test(t)) return 'verder';
  if (START.test(t)) return 'start';
  if (OVERSLAAN.test(t)) return 'overslaan';
  return null;
}

/** Waar het interview staat (per apparaat: index van de open vraag, of null = geen). */
export interface Stand {
  open: number | null;
  /** Alles langs, ook wat al een antwoord heeft ("sla over" houdt het oude). */
  opnieuw?: boolean;
}

export function vraagTekst(i: number): string {
  const v = VRAGEN[i];
  return v ? `Vraag ${i + 1} van ${VRAGEN.length}: ${v.vraag}` : '';
}

const VOETNOOT = '(Zeg "sla over" of "stop interview" wanneer je wilt.)';

export interface Beurt {
  stand: Stand;
  antwoord: string;
  /** Te bewaren antwoord, als dit bericht er een was. */
  bewaar?: { id: string; kop: string; vraag: string; antwoord: string };
}

/**
 * Eén bericht verwerken. Null = dit bericht hoort niet bij het interview
 * (geen opdracht en er loopt geen interview): gewoon door naar de chat.
 * `bekend` = vraag-ids die al een antwoord hebben (uit het geheugen).
 */
export function verwerk(tekst: string, stand: Stand, bekend: ReadonlySet<string> = new Set()): Beurt | null {
  const actie = interviewOpdracht(tekst);
  const volgendeOpen = (vanaf: number) => {
    for (let i = vanaf; i < VRAGEN.length; i++) if (!bekend.has(VRAGEN[i].id)) return i;
    return null;
  };
  if (actie === 'stop') {
    if (stand.open === null) return null;
    return { stand: { open: null }, antwoord: 'Interview gepauzeerd. Zeg "ga verder met het interview" om door te gaan.' };
  }
  if (actie === 'start' || actie === 'verder') {
    const i = actie === 'start' && bekend.size === 0 ? 0 : volgendeOpen(0);
    if (i === null) {
      return {
        stand: { open: 0, opnieuw: true },
        antwoord: `Je hebt alle ${VRAGEN.length} vragen al beantwoord, dus we lopen ze opnieuw langs. "Sla over" houdt je oude antwoord.\n\n${vraagTekst(0)}\n${VOETNOOT}`,
      };
    }
    const intro = actie === 'start' && bekend.size === 0
      ? `Goed, ${VRAGEN.length} korte vragen zodat ik je beter ken. Wat je zegt onthoud ik op al je apparaten.\n\n`
      : 'We gaan verder.\n\n';
    return { stand: { open: i }, antwoord: `${intro}${vraagTekst(i)}\n${VOETNOOT}` };
  }
  if (stand.open === null) return null;

  const huidig = VRAGEN[stand.open];
  if (!huidig) return { stand: { open: null }, antwoord: 'Het interview is klaar.' };
  const bewaar = actie === 'overslaan'
    ? undefined
    : { id: huidig.id, kop: huidig.kop, vraag: huidig.vraag, antwoord: tekst.trim().slice(0, 1200) };
  const nuBekend = new Set(bekend);
  if (bewaar) nuBekend.add(bewaar.id);
  let volgende: number | null = null;
  for (let i = stand.open + 1; i < VRAGEN.length; i++) if (stand.opnieuw || !nuBekend.has(VRAGEN[i].id)) { volgende = i; break; }
  if (volgende === null) {
    return {
      stand: { open: null },
      bewaar,
      antwoord: `Dank je, dat was de laatste. Ik weet nu ${nuBekend.size} van de ${VRAGEN.length} dingen over je, en ik gebruik ze in elk gesprek. Iets veranderd? Zeg "interview me" en ik vraag wat nog open is.`,
    };
  }
  return { stand: { open: volgende, opnieuw: stand.opnieuw }, bewaar, antwoord: `${bewaar ? 'Genoteerd. ' : ''}${vraagTekst(volgende)}` };
}

export interface ProfielRegel { id: string; antwoord: string }

/** Het blok voor de systeemprompt, of ''. */
export function profielBlok(regels: readonly ProfielRegel[]): string {
  const per = new Map(regels.map((r) => [r.id, r.antwoord]));
  const delen = VRAGEN.filter((v) => per.get(v.id)?.trim()).map((v) => `- ${v.kop}: ${per.get(v.id)!.trim().replace(/\s+/g, ' ')}`);
  if (!delen.length) return '';
  return `\n\n## Wie Luka is (uit zijn eigen interview)\n${delen.join('\n')}\nGebruik dit stil: noem het interview niet, pas je toon en keuzes erop aan.`;
}

export function profielSleutel(id: string): string {
  return `${PROFIEL_PREFIX}${id}`;
}

export function idUitSleutel(key: string): string | null {
  if (!key.startsWith(PROFIEL_PREFIX)) return null;
  const id = key.slice(PROFIEL_PREFIX.length);
  return VRAGEN.some((v) => v.id === id) ? id : null;
}
