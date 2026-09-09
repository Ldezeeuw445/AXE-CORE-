/**
 * Wat een providerkaart zegt en welke kleur daarbij hoort.
 *
 * Hier en niet in het componentbestand: dit is een regel, geen weergave, en
 * hij wordt op twee plekken gelezen -- het instellingenscherm en de
 * uitschuifbalk. Twee plekken die hetzelfde moeten tonen mogen hun antwoord
 * niet zelf verzinnen.
 */

export type KaartStand = 'idle' | 'testing' | 'ok' | 'fail';

/**
 * De tekst rechtsboven.
 *
 * "Ready" en niet "Connected" voor een provider die is ingesteld maar nooit
 * getest: Connected beweert dat er iets gemeten is, en dat is niet zo.
 */
export function standTekst(stand: KaartStand, ingesteld: boolean): string {
  if (stand === 'testing') return 'Testing…';
  if (stand === 'ok') return 'Connected';
  if (stand === 'fail') return 'Failed';
  return ingesteld ? 'Ready' : 'No key';
}

/**
 * De kleur van de stip.
 *
 * Rood is voorbehouden aan één stand: mislukt. Een provider zonder sleutel is
 * niet stuk, die is nooit ingesteld -- en op een scherm met achttien kaarten
 * is dat precies het verschil dat je wil zien.
 */
export function standKleur(stand: KaartStand, ingesteld: boolean): string {
  if (stand === 'ok') return 'var(--m-happened)';
  if (stand === 'fail') return 'var(--m-broken)';
  if (stand === 'testing') return 'var(--m-budget)';
  return ingesteld ? 'var(--text-muted)' : 'var(--m-idle)';
}

/**
 * De rand van de kaart, zodat je in één oogopslag ziet wat werkt.
 *
 * De stip alleen is te klein op een scherm met achttien kaarten: je moet er
 * langs om te lezen wat er staat. Een rand in dezelfde kleur zie je zonder te
 * kijken. Geen gevuld vlak -- dat schreeuwt, en de kleur hoort bij de STAND
 * van de kaart, niet bij zijn inhoud.
 *
 * Alleen werkt en mislukt krijgen een kleur. Grijs is de rest, want een kaart
 * die nooit getest is hoort niet mee te doen aan het overzicht van wat er
 * werkt.
 */
export function standRand(stand: KaartStand): string {
  if (stand === 'ok') return 'color-mix(in srgb, var(--m-happened) 45%, transparent)';
  if (stand === 'fail') return 'color-mix(in srgb, var(--m-broken) 55%, transparent)';
  return 'var(--border-default)';
}
