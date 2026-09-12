/**
 * Draait deze app binnen een iframe -- in de telefoon op Home, bijvoorbeeld?
 *
 * De telefoon laadt onze eigen bundel op #/mobile. Dat is dezelfde app, met
 * dezelfde Home, met dezelfde telefoon erop. Zonder deze vraag rendert de app
 * in de telefoon dus opnieuw een telefoon zodra hij op Home komt (Settings ->
 * Home is twee tikken), en die laadt weer de hele app, en zo verder: elke laag
 * een volledige AXE met bol, geheugen en opstartroutine. Gemeten in de
 * gebouwde bundel: op diepte 1 stond al een tweede telefoon met eigen iframe.
 *
 * Als `top` niet te lezen is (andere origin) zitten we per definitie in een
 * frame, dus dan is het antwoord ook ja.
 */
export type Venster = Pick<Window, 'self' | 'top'>;

export function isIngebed(w: Venster | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!w) return false;
  try {
    return w.self !== w.top;
  } catch {
    return true;
  }
}

/**
 * Of de schil TopNav, onderbalk en composer moet weglaten.
 *
 * Drie plekken, één regel: #/mobile is zelf het telefoonoppervlak; de
 * Android-schil tekent haar eigen chroom; en in het iframe van de zwevende
 * telefoon zou desktopchroom 80 procent van 393 px opeten. Zonder deze
 * derde tak "werken alle tabs vanaf de telefoon" alleen op papier.
 */
export function schilZonderChroom(
  pathname: string,
  extra: { android?: boolean; ingebed?: boolean } = {},
): boolean {
  return pathname === '/mobile' || extra.android === true || extra.ingebed === true;
}
