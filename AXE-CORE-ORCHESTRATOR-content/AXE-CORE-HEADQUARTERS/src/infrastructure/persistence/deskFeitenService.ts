/**
 * Bureaufeiten: berekend op een hartslag, gelezen door de agents.
 *
 * ## Het probleem dat dit oplost
 *
 * `correlatie.ts` en `gebeurtenisImpact.ts` rekenden goed en werden door
 * niemand gelezen: allebei alleen aangeroepen vanuit hun eigen paneel. Een
 * agent die XAUUSD wil bijkopen terwijl hij XAGUSD aanhoudt wist niet dat die
 * twee op 0,82 lopen, terwijl het cijfer op het scherm stond.
 *
 * De voor de hand liggende oplossing — de agent laat het zelf uitrekenen — kan
 * niet. De gratis laag van LSE geeft tien downloads per uur; één matrix over
 * acht paren is er acht. Een autopilot die elk kwartier wakker wordt staat na
 * de eerste ronde stil, en dan is het niet de code die je 24/7-bureau tegenhoudt
 * maar je datalimiet.
 *
 * Dus omgekeerd: één hartslag rekent, schrijft het weg, en elke agentrun leest
 * die regel. Nul LSE-aanroepen per run, en alle lanes zien hetzelfde cijfer —
 * wat op zichzelf al winst is, want twee lanes die hun eigen matrix uitrekenen
 * gaan vroeg of laat iets anders zeggen en dan is niet te zien wie gelijk heeft.
 *
 * ## Waarom de tekst wordt opgeslagen en niet opnieuw opgebouwd
 *
 * `agent_tekst` is precies wat de agent voorgeschoteld krijgt, zoals hij op het
 * moment van meten luidde. Hem bij het lezen opnieuw genereren uit `data` zou
 * betekenen dat een wijziging in de opmaakfunctie met terugwerkende kracht
 * verandert wat er "toen" tegen de agent is gezegd. Dan is een beslissing
 * achteraf niet meer na te lopen.
 *
 * ## Append-only
 *
 * Eén regel per meting, geen upsert. Over drie maanden is dan te zien DAT goud
 * en zilver uit elkaar liepen, niet alleen dat ze het vandaag doen. Lezers nemen
 * de nieuwste per (soort, sleutel).
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';

export type DeskFeitSoort = 'correlatie' | 'gebeurtenis_impact';

export interface DeskFeit {
  soort: DeskFeitSoort;
  /** Waar dit feit over gaat: 'H1', of 'Employment Situation|XAUUSD|60'. */
  sleutel: string;
  /** Letterlijk wat een agent voorgeschoteld krijgt. */
  agentTekst: string;
  gemetenOp: string;
  data?: unknown;
}

/** Ouder dan dit is geen bureaufeit meer maar een herinnering. */
export const VERS_GENOEG_MS = 6 * 60 * 60 * 1000;

/**
 * Schrijf één gemeten feit weg.
 *
 * Geeft false terug in plaats van te werpen: dit hangt aan een hartslag, en een
 * hartslag die omvalt op een schrijffout laat de volgende meting ook niet meer
 * gebeuren. De fout wordt wel gelogd — stil falen is precies wat deze codebase
 * op drie plekken heeft moeten repareren.
 */
export async function schrijfDeskFeit(feit: {
  soort: DeskFeitSoort;
  sleutel: string;
  agentTekst: string;
  data?: unknown;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.from('core_desk_feiten').insert({
    user_id: AXE_USER_ID,
    soort: feit.soort,
    sleutel: feit.sleutel,
    agent_tekst: feit.agentTekst,
    data: feit.data ?? {},
  });

  if (error) {
    console.error('[deskFeiten] schrijven mislukt', error.message);
    return false;
  }
  return true;
}

interface RuweRegel {
  soort: string;
  sleutel: string;
  agent_tekst: string;
  gemeten_op: string;
  data?: unknown;
}

/**
 * De nieuwste meting per (soort, sleutel).
 *
 * @param maxOuderdomMs weiger feiten die ouder zijn. Standaard `VERS_GENOEG_MS`.
 *        Een correlatie van vorige week een agent in duwen is erger dan er geen
 *        meegeven: hij kan aan de tekst niet zien hoe oud hij is, en handelt
 *        erop alsof het van vanochtend is.
 */
export async function leesDeskFeiten(
  maxOuderdomMs = VERS_GENOEG_MS,
): Promise<DeskFeit[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const grens = new Date(Date.now() - maxOuderdomMs).toISOString();
  const { data, error } = await sb
    .from('core_desk_feiten')
    .select('soort, sleutel, agent_tekst, gemeten_op, data')
    .eq('user_id', AXE_USER_ID)
    .gte('gemeten_op', grens)
    .order('gemeten_op', { ascending: false })
    .limit(60);

  if (error) {
    console.error('[deskFeiten] lezen mislukt', error.message);
    return [];
  }

  // Nieuwste per sleutel. De query levert aflopend op tijd, dus de eerste die
  // langskomt is de juiste en de rest is geschiedenis.
  const gezien = new Set<string>();
  const uit: DeskFeit[] = [];
  for (const r of (data ?? []) as RuweRegel[]) {
    const k = `${r.soort}|${r.sleutel}`;
    if (gezien.has(k)) continue;
    gezien.add(k);
    uit.push({
      soort: r.soort as DeskFeitSoort,
      sleutel: r.sleutel,
      agentTekst: r.agent_tekst,
      gemetenOp: r.gemeten_op,
      data: r.data,
    });
  }
  return uit;
}

/**
 * De bureaufeiten als één blok voor in een prompt.
 *
 * Met de ouderdom erbij per feit, in woorden. Een agent die niet kan zien of een
 * correlatie van tien minuten of van vijf uur geleden is, behandelt beide als
 * nu — en de eerste is een meting, de tweede een aanname.
 *
 * Leeg is niet stil: staat er niets, dan zegt dit blok dát, zodat "het bureau
 * heeft niets gemeten" niet leest als "er is niets aan de hand".
 */
export function deskFeitenBlok(feiten: DeskFeit[], nu = Date.now()): string {
  if (!feiten.length) {
    return 'BUREAUFEITEN: geen verse meting beschikbaar (correlatie noch '
      + 'gebeurtenisimpact). Dat is niet "rustig" — het is niet gemeten. '
      + 'Behandel spreiding en volatiliteit als onbekend, niet als gunstig.';
  }

  const regels = feiten.map((f) => {
    const minuten = Math.round((nu - Date.parse(f.gemetenOp)) / 60_000);
    const oud = minuten < 90
      ? `${minuten} min geleden`
      : `${Math.round(minuten / 60)} uur geleden`;
    return `[gemeten ${oud}]\n${f.agentTekst}`;
  });

  return `BUREAUFEITEN (berekend door het bureau, niet door jou):\n${regels.join('\n\n')}`;
}
