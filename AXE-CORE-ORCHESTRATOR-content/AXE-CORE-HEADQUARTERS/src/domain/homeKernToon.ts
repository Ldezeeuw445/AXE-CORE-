/**
 * Kleur van de kerntegels AI core en System op Home (26 nov).
 *
 * Een gele FIX hoort bij iets wat Luka moet doen. Eerst stond AI core geel
 * zodra AXE dacht of sprak, en System geel bij één mislukte run op 99,4%.
 */
export type KernToon = 'ok' | 'let-op' | 'fout' | 'uit';

export function kernTegelToon(kern: { label: string; fout: boolean } | null): KernToon {
  if (!kern) return 'uit';
  if (kern.fout || /^offline$/i.test(kern.label)) return 'fout';
  if (/^approval$/i.test(kern.label)) return 'let-op';
  if (/^checking$/i.test(kern.label)) return 'uit';
  return 'ok';
}

/** Onder 98% geslaagd is let-op, onder 90% fout. Zonder runs: mislukte taken tellen. */
export function systeemTegelToon(i: { gemeten: boolean; totaal: number; fouten: number; takenMislukt: number }): KernToon {
  if (!i.gemeten) return 'uit';
  if (i.totaal > 0) {
    const ok = (i.totaal - i.fouten) / i.totaal;
    if (ok < 0.9) return 'fout';
    if (ok < 0.98) return 'let-op';
    return 'ok';
  }
  return i.takenMislukt > 0 ? 'let-op' : 'ok';
}
