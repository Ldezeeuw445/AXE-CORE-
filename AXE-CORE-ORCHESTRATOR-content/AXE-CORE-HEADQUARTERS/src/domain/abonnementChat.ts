/**
 * De chat van AXE Core op je eigen abonnement, via een codeer-CLI.
 *
 * ## Wat hier gebeurt en waarom het iets anders is
 *
 * Elke andere provider in deze app is een HTTP-API met een gemeterde sleutel:
 * je betaalt per token, en een gesprek van tien beurten is tien rekeningen.
 * Claude Code, Codex en Cursor zijn geen API maar een CLI die op een INGELOGDE
 * SESSIE draait -- het abonnement dat je toch al betaalt. Dezelfde motoren die
 * de code-editor gebruikt, nu ook voor de gewone chat.
 *
 * Dat heeft een gevolg dat je moet weten: deze CLI's draaien altijd IN een
 * checkout. De chat praat dus vanuit een repo en kan de code lezen waar hij het
 * over heeft. Dat is geen bijwerking maar de reden dat dit de moeite waard is --
 * AXE Core die over AXE Core praat terwijl hij erin staat.
 *
 * ## Waarom alleen-lezen, en waarom dat niet instelbaar is
 *
 * `plan` en niets anders. Een chatvenster is de plek waar je hardop denkt, en
 * "hoe zou ik dit aanpakken" mag nooit betekenen dat er bestanden herschreven
 * worden terwijl je een vraag stelde. Bewerken hoort in de code-editor, waar je
 * een repo kiest, een modus kiest en de wijzigingen ziet voor je ze pusht.
 *
 * Dat staat hier als constante en niet als parameter, want een parameter is een
 * uitnodiging om hem ooit ergens op `acceptEdits` te zetten "omdat het handiger
 * is", en dan is er geen plek meer waar dit nog vastligt.
 */

/**
 * Welke codeer-CLI's er zijn.
 *
 * Hier en niet in de gateway: wélke motoren bestaan is een regel, geen detail
 * van de draad. De gateway haalt dit type hiervandaan -- andersom zou domain/
 * uit infrastructure/ moeten importeren, en dat is precies de grens die
 * architecture.test.ts bewaakt (en die hem bij de eerste versie van dit bestand
 * ook meteen ving).
 */
export type AgentEngine = 'claude' | 'codex' | 'cursor';

/** De provider-id die deze weg kiest. */
export const ABONNEMENT_PROVIDER = 'abonnement';

/** Alleen-lezen. Zie de kop: met opzet geen parameter. */
export const ABONNEMENT_MODUS = 'plan' as const;

export const ABONNEMENT_MOTOREN: readonly AgentEngine[] = ['claude', 'codex', 'cursor'] as const;

/**
 * De motor voor wie niets gekozen heeft.
 *
 * Codex, want daar vroeg Luka om voor de chat van AXE Core: het
 * ChatGPT-abonnement draagt het gesprek, Claude Code blijft de motor van de
 * code-editor. Twee abonnementen, elk waar hij het meest waard is.
 *
 * Hier als constante en niet twee keer uitgeschreven: `defaultModel` in
 * providers.ts en de terugval in `motorVanSlot` MOETEN hetzelfde zijn. Staan ze
 * los, dan kan de kaart 'codex' tonen terwijl een slot zonder model stilletjes
 * claude draait -- en dan zoek je in de verkeerde logs naar een antwoord dat
 * ergens anders vandaan kwam.
 */
export const STANDAARD_MOTOR: AgentEngine = 'codex';

/** Waar de repo-keuze voor de chat wordt bewaard. */
export const REPO_SLEUTEL = 'axe_abonnement_repo';

/**
 * Welke motor dit slot bedoelt.
 *
 * Het `model`-veld draagt hier de motornaam. Dat is geen truc maar de eerlijke
 * vertaling: voor deze provider ís de keuze welke CLI het wordt, en de app heeft
 * al overal een modelkiezer staan. Een tweede, apart keuzeveld dat alleen bij
 * deze ene provider hoort zou een scherm opleveren waarop twee dingen hetzelfde
 * lijken te betekenen.
 *
 * Een onbekende waarde valt terug op STANDAARD_MOTOR in plaats van te weigeren:
 * een oude opgeslagen keuze of een typefout hoort een werkende chat te geven,
 * niet een foutmelding waar je niets aan kunt doen.
 */
export function motorVanSlot(model: string | undefined): AgentEngine {
  const m = (model || '').trim().toLowerCase();
  return (ABONNEMENT_MOTOREN as readonly string[]).includes(m) ? (m as AgentEngine) : STANDAARD_MOTOR;
}

export interface ChatBericht { role: 'user' | 'assistant' | 'system'; content: string }

/**
 * Bouwt één prompt uit een gesprek.
 *
 * Deze CLI's nemen één tekst aan, geen berichtenlijst met rollen. De omzetting
 * moet dus hier gebeuren, en ze moet het onderscheid BEWAREN: zonder labels
 * loopt wat jij vroeg over in wat AXE antwoordde, en dan gaat de motor zijn
 * eigen vorige antwoord lezen als jouw instructie.
 *
 * Het systeembericht staat apart bovenaan en niet als eerste beurt, want het is
 * geen beurt -- het is de staande opdracht, en die hoort niet halverwege een
 * gesprek te lijken.
 *
 * De laatste vraag staat aan het eind. Dat is waar deze motoren hem verwachten
 * en het is ook waar een lezer hem zoekt.
 */
export function bouwPrompt(berichten: ChatBericht[]): string {
  const systeem = berichten.filter(b => b.role === 'system').map(b => b.content.trim()).filter(Boolean);
  const beurten = berichten.filter(b => b.role !== 'system');

  const delen: string[] = [];
  if (systeem.length) delen.push(systeem.join('\n\n'));

  if (beurten.length > 1) {
    const eerder = beurten.slice(0, -1)
      .map(b => `${b.role === 'user' ? 'Luka' : 'AXE'}: ${b.content.trim()}`)
      .join('\n\n');
    if (eerder) delen.push(`Eerder in dit gesprek:\n\n${eerder}`);
  }

  const laatste = beurten[beurten.length - 1];
  if (laatste) delen.push(laatste.role === 'user' ? laatste.content.trim() : `AXE: ${laatste.content.trim()}`);

  return delen.join('\n\n---\n\n').trim();
}

/**
 * Welke repo de chat gebruikt.
 *
 * Je keuze wint. Staat die er niet, of wijst hij naar een repo die niet meer
 * draaien kan, dan de eerste die het wél kan -- een chat die weigert omdat een
 * opgeslagen naam verouderd is, is onbruikbaar terwijl er een werkend
 * alternatief naast staat.
 *
 * Null als er niets bruikbaars is. De aanroeper hoort dat te melden en niet een
 * willekeurige repo te kiezen: waar deze chat draait bepaalt welke code hij
 * leest, en dat mag nooit een gok zijn.
 */
export function kiesRepo(
  voorkeur: string | null | undefined,
  repos: Record<string, { runnable: boolean }>,
): string | null {
  const bruikbaar = Object.entries(repos).filter(([, r]) => r.runnable).map(([n]) => n);
  if (voorkeur && bruikbaar.includes(voorkeur)) return voorkeur;
  return bruikbaar.length ? bruikbaar.sort()[0] : null;
}
