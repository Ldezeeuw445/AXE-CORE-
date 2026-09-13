/**
 * De apps van het ecosysteem: één lijst, voor elk scherm dat per app groepeert.
 *
 * ## Waarom dit een domeinmodule is
 *
 * De cron-tab had deze lijst voor zichzelf. Toen de taken-tab hem ook nodig
 * had, stond ik op het punt hem over te tikken -- en dan lopen de kleuren,
 * de namen en vooral de ID's uit elkaar. Een taak die op 'axon' staat terwijl
 * cron 'axon_memory' gebruikt is geen zichtbare fout: hij valt gewoon in de
 * verkeerde kolom, en dat merk je nooit.
 *
 * ## Waarom de id in metadata staat en niet in een kolom
 *
 * Zowel CronSchedule als DurableTaskRun dragen een vrij `metadata`-veld. Daar
 * de app in zetten kost geen migratie en geen backend-wijziging, en het werkt
 * met alles wat er al staat: een rij zonder app valt terug op AXE Core.
 *
 * Terugvallen en niet verbergen. Een schema of een taak die nergens meer te
 * zien is blijft wél bestaan -- en dat ontdek je pas als het iets kapotmaakt.
 */

export type AppId = 'axe_core' | 'axe_companion' | 'trading_os' | 'axon_memory' | 'northsea';

export interface AppMeta {
  id: AppId;
  label: string;
  /** De eigen kleur van deze app. Zit in de LETTERS, nooit in een vlak. */
  kleur: string;
  /** Eén regel: wat deze app hier is. */
  blurb: string;
}

export const APPS: readonly AppMeta[] = [
  { id: 'axe_core',      label: 'AXE Core',      kleur: '#22D3EE', blurb: 'Prompts, CrewAI-runs en VPS-commando’s op je eigen server' },
  { id: 'axe_companion', label: 'AXE Companion', kleur: '#A78BFA', blurb: 'De mobiele app' },
  { id: 'trading_os',    label: 'Trading OS',    kleur: '#34D399', blurb: 'De web-app en het terminal' },
  { id: 'axon_memory',   label: 'AXON Memory',   kleur: '#F5A524', blurb: 'Het geheugen onder alles' },
  /* Roze en niet blauw. Het stond op #38BDF8 en dat is 33 stappen van het
     cyaan van AXE Core -- de test rekende het uit en die twee kolommen waren
     naast elkaar niet uit elkaar te houden. Een kleur die je moet vergelijken
     om hem te herkennen doet zijn werk niet. */
  { id: 'northsea',      label: 'Northsea Commodity Partners', kleur: '#F472B6', blurb: 'De handelsdesk' },
] as const;

/** De vier naast AXE Core, in de volgorde waarin ze op het scherm staan. */
export const NAAST_CORE: readonly AppId[] = ['axe_companion', 'trading_os', 'axon_memory', 'northsea'] as const;

export const STANDAARD_APP: AppId = 'axe_core';

export function isAppId(v: unknown): v is AppId {
  return typeof v === 'string' && APPS.some(a => a.id === v);
}

export function appMeta(id: AppId): AppMeta {
  return APPS.find(a => a.id === id) ?? APPS[0];
}

/**
 * Welke app hoort bij deze rij?
 *
 * Leest `metadata.app`. Onbekend of leeg valt terug op AXE Core -- zie boven
 * waarom dat geen verbergen mag worden.
 */
export function appVan(metadata: Record<string, unknown> | null | undefined): AppId {
  const a = metadata?.app;
  return isAppId(a) ? a : STANDAARD_APP;
}

/** De metadata om mee te sturen als je iets voor deze app aanmaakt. */
export function metMetaApp(app: AppId, rest: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...rest, app };
}
