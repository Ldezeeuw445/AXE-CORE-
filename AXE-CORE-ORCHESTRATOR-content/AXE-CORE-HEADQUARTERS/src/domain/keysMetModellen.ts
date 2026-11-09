/**
 * Keys per app + Models & Tests: één verhaal.
 *
 * Het sleuteloverzicht (VPS) ziet alleen wat op de VPS staat. Veel AI-keys
 * staan in Instellingen -> Keys, en OpenHands en Ollama draaien zonder key op
 * de VPS zelf. Models & Tests test die wel. Daarom neemt het overzicht die
 * uitslag over: een geslaagde test is "Works", een mislukte "Broken" (of,
 * voor een key die je niet nodig hebt, gewoon "Not used").
 */
import type { KeyRow } from '@/infrastructure/gateways/axeCoreApiService';

export type ModelTest = 'ok' | 'fail' | 'testing' | 'idle' | undefined;

export function metModelTest(rij: KeyRow, test: ModelTest): KeyRow {
  if (!rij.provider || (test !== 'ok' && test !== 'fail')) return rij;
  if (test === 'ok') {
    return { ...rij, status: 'works', detail: 'Models & Tests: connected' };
  }
  if (rij.need === 'unused') {
    return { ...rij, status: 'unused', detail: `Models & Tests: failed; not needed (${rij.purpose})` };
  }
  return { ...rij, status: 'broken', detail: 'Models & Tests: failed' };
}
