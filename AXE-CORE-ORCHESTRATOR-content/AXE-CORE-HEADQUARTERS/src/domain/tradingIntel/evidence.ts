/**
 * evidence — uit welke omgeving een uitkomst komt, en welke uitkomsten een
 * account mag gebruiken om strategieën te kiezen.
 *
 * Het ledger telde elke gesloten trade in dezelfde tellers, of hij nu uit het
 * papieren boek kwam, van een demo-account of van een funded/echt account. Die
 * tellers kiezen welke strategie er op een account handelt, dus een strategie
 * die alleen op papier won kon op een funded account "bewezen" raken.
 *
 * ## Niets wordt achteraf omgelabeld
 *
 * Tellers van vóór deze module hebben geen omgeving. Ze worden NIET demo, live
 * of wat dan ook genoemd: ze heten 'legacy' (het totaal min alles wat wel een
 * label heeft) en een live/funded account rekent er niet mee.
 */

export type EvidenceEnv = 'paper' | 'demo' | 'live' | 'unknown';

/** Wat een account is. 'live' = echt geld of funded: uitkomsten met gevolgen. */
export type AccountEnvironment = 'demo' | 'live';

export const EVIDENCE_ENVS: readonly EvidenceEnv[] = ['paper', 'demo', 'live', 'unknown'];

export interface EvidencePolicy {
  /** Welke gelabelde omgevingen meetellen. */
  envs: readonly EvidenceEnv[];
  /** Tellen de ongelabelde tellers van vóór de omgevingen mee? */
  includeLegacy: boolean;
  /** Voor spoor en scherm. */
  label: string;
}

/** Alles, zoals het ledger altijd rekende. Standaard voor weergave en demo. */
export const ALL_EVIDENCE: EvidencePolicy = {
  envs: EVIDENCE_ENVS, includeLegacy: true, label: 'all evidence (paper, demo, live, legacy)',
};

/**
 * Welk bewijs een account mag gebruiken om te kiezen en te sizen.
 *
 * - live/funded: alleen live/funded uitkomsten. Geen papier, geen demo, geen
 *   legacy — die kunnen allemaal van een andere omgeving zijn en zijn dat vaak.
 * - demo, of onbekend: alles, zoals voorheen. Een demo mag leren van meer.
 */
export function evidencePolicyFor(env: AccountEnvironment | null | undefined): EvidencePolicy {
  if (env === 'live') return { envs: ['live'], includeLegacy: false, label: 'live/funded evidence only' };
  return ALL_EVIDENCE;
}

/**
 * De omgeving volgens de broker zelf (MetaAPI account-information `type`).
 * CONTEST telt als demo. Onbekend = null: dan beslist niets hier.
 */
export function environmentFromBrokerTradeMode(mode: string | null | undefined): AccountEnvironment | null {
  const m = String(mode ?? '').toUpperCase();
  if (m.includes('REAL')) return 'live';
  if (m.includes('DEMO') || m.includes('CONTEST')) return 'demo';
  return null;
}

/** Hoe een uitkomst van een account gelabeld wordt. */
export function evidenceEnvForAccount(env: AccountEnvironment | null | undefined): EvidenceEnv {
  return env === 'live' ? 'live' : env === 'demo' ? 'demo' : 'unknown';
}
