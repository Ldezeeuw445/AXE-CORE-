/**
 * a17 — het enige toestel dat de device manager mag aanraken.
 *
 * De device manager bestaat voor één telefoon: de Samsung Galaxy A17. Pinnen
 * daarop is geen voorkeur maar een grens. Een adb-host ziet elke telefoon die
 * in de Mac hangt, en een tap naar de verkeerde is er een die je niet kunt
 * terugnemen. Daarom kent elke laag die een toestel kan bewegen — de bridge in
 * `adb.mjs` en het nep-toestel in `phoneDemoDevice.ts` — via déze ene matcher
 * wat "de A17" is.
 *
 * adb meldt het model met underscores (`SM_A175F`); iemand tikt het met een
 * streepje (`SM-A175F`). Allebei worden platgeslagen tot dezelfde letters voor
 * de familietest, zodat de vorm van de scheiding er niet toe doet.
 */

/** A17-familie: SM-A17x. Env kan de pin verbreden, dit is de bodem. */
export const A17_MODEL_RE = /^SMA17/;

export function isA17Model(model: string | null | undefined): boolean {
  if (!model) return false;
  const norm = model.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return A17_MODEL_RE.test(norm);
}

/** Het scherm van de A17 in device-pixels. Het frame en de tap-mapping rekenen hierop. */
export const A17_SCREEN = { width: 1080, height: 2340 } as const;

/** Wat het nep-toestel beweert te zijn — een echt A17-modelnummer. */
export const A17_DEMO_MODEL = 'SM-A175F';
