/**
 * Keys per app + Models & Tests: één verhaal.
 *
 * Het sleuteloverzicht (VPS) ziet alleen wat op de VPS staat. Veel AI-keys
 * staan in Instellingen -> Keys, en OpenHands en Ollama draaien zonder key op
 * de VPS zelf. Models & Tests test die wel. Daarom neemt het overzicht die
 * uitslag over: een geslaagde test is "Works", een mislukte "Broken" (of,
 * voor een key die je niet nodig hebt, gewoon "Not used").
 */

export type ModelTest = 'ok' | 'fail' | 'testing' | 'idle' | undefined;

/**
 * The fields this rule reads and writes. Structural, so domain/ does not
 * import the gateway's KeyRow (the innermost layer only knows itself); any
 * KeyRow fits and comes back as the same type.
 */
export type KeyRowShape = {
  status: string;
  detail: string;
  purpose: string;
  need?: 'required' | 'optional' | 'unused';
  provider?: string | null;
};

export function metModelTest<T extends KeyRowShape>(rij: T, test: ModelTest): T {
  if (!rij.provider || (test !== 'ok' && test !== 'fail')) return rij;
  if (test === 'ok') {
    return { ...rij, status: 'works', detail: 'Models & Tests: connected' };
  }
  if (rij.need === 'unused') {
    return { ...rij, status: 'unused', detail: `Models & Tests: failed; not needed (${rij.purpose})` };
  }
  return { ...rij, status: 'broken', detail: 'Models & Tests: failed' };
}
