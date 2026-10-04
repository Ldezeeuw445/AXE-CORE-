/**
 * Notities op pad samenvoegen. De kluis heeft één notitie per pad;
 * twee lijsten met dezelfde map blijven één.
 */
export function voegKluisNotitiesSamen<T extends { path: string; updated_at?: string }>(
  ...lijsten: Array<readonly T[]>
): T[] {
  const map = new Map<string, T>();
  for (const lijst of lijsten) {
    for (const n of lijst) {
      const oud = map.get(n.path);
      if (!oud) {
        map.set(n.path, n);
        continue;
      }
      if ((n.updated_at || '') > (oud.updated_at || '')) map.set(n.path, n);
    }
  }
  return [...map.values()];
}
