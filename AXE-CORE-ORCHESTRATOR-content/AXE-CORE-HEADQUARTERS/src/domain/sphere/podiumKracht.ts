/**
 * Hoe zwaar het Home-podium mag zijn.
 *
 * De 3D-vloer en perspective-transforms zijn goedkoop t.o.v. de canvas-bol,
 * maar op een zwakke GPU of met reduced-motion is plat beter dan een toneel
 * dat hapt. Deze file kent geen DOM: de UI meet, hier wordt gekozen.
 */
export type PodiumKracht = 'vol' | 'licht' | 'plat';

export function podiumKrachtVan(env: {
  reducedMotion: boolean;
  webgl: boolean;
  cores?: number;
  geheugenGb?: number;
}): PodiumKracht {
  if (env.reducedMotion) return 'plat';
  if (!env.webgl) return 'plat';
  if ((env.geheugenGb != null && env.geheugenGb > 0 && env.geheugenGb <= 2)
    || (env.cores != null && env.cores > 0 && env.cores <= 2)) {
    return 'licht';
  }
  return 'vol';
}

/** Zonder canvas: false. Met een stub die webgl teruggeeft: true. */
export function webglBeschikbaar(
  getContext?: (type: string, attrs?: unknown) => unknown,
): boolean {
  if (!getContext) return false;
  try {
    return !!(getContext('webgl2') || getContext('webgl'));
  } catch {
    return false;
  }
}
