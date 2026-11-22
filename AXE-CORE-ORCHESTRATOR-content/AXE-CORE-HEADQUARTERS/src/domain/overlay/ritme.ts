/**
 * Ritme (22 nov, BOUWLIJST "Log + ritme"): hoeveel er per dag af is, laatste
 * 30 dagen, als een strookje balkjes. Puur: de hoogtes en de ene zin erbij.
 */
export type RitmeDag = { dag: string; aantal: number };

export type RitmeStrook = {
  balken: Array<{ dag: string; aantal: number; hoogte: number; vandaag: boolean }>;
  zin: string;
};

/** Hoogte 0..1 per dag (de drukste dag = 1); een lege dag krijgt een stipje (0,08). */
export function ritmeStrook(dagen: RitmeDag[]): RitmeStrook {
  const max = Math.max(1, ...dagen.map((d) => d.aantal));
  const balken = dagen.map((d, i) => ({
    dag: d.dag,
    aantal: d.aantal,
    hoogte: d.aantal ? Math.max(0.15, d.aantal / max) : 0.08,
    vandaag: i === dagen.length - 1,
  }));
  const vandaag = dagen.at(-1)?.aantal ?? 0;
  const week = dagen.slice(-7).reduce((n, d) => n + d.aantal, 0);
  const zin = dagen.length === 0 ? '' : `${vandaag} done today · ${week} this week`;
  return { balken, zin };
}
