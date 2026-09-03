/**
 * Welke uiterlijke stand de app draait.
 *
 * ## Waarom dit een domeinmodule is
 *
 * De waarde komt uit drie richtingen — localStorage, user_settings in Supabase,
 * en het `data-look`-attribuut dat al op <html> kan staan — en die kunnen het
 * oneens zijn. Wat er dan wint is een regel, geen schermgedrag, en een regel
 * hoort op één plek te staan waar je hem kunt nalezen en testen.
 *
 * ## De standen
 *
 *   black  matzwart met omlijnde panelen. Wat de app altijd was.
 *   glass  dezelfde indeling op een plaat met sfeer; de panelen verliezen hun
 *          kader omdat de grond het scheiden overneemt.
 *
 * Lettertype, accentkleuren en tekstkleuren zijn in beide standen identiek.
 * Alleen --bg-* en --border-* wijken af (zie design/axe-look.css).
 */

export type Look = 'black' | 'glass';

export const LOOKS: readonly Look[] = ['black', 'glass'] as const;

/**
 * De stand voor wie nog nooit gekozen heeft.
 *
 * Zwart, en dat is opzet: een nieuwe stand hoort niet ongevraagd de app van
 * iemand te veranderen. Wie glas wil, zet het aan.
 */
export const DEFAULT_LOOK: Look = 'black';

/** Of deze waarde een stand is die we kennen. */
export function isLook(value: unknown): value is Look {
  return typeof value === 'string' && (LOOKS as readonly string[]).includes(value);
}

/**
 * Kiest de stand uit wat er beschikbaar is.
 *
 * De volgorde is de vertrouwensvolgorde: de cloud weet wat je op je andere
 * apparaten koos, localStorage weet wat je hier het laatst deed, en pas als
 * geen van beide iets zinnigs zegt valt hij terug op de standaard.
 *
 * Onbekende waarden worden genegeerd in plaats van doorgegeven. Een typefout
 * of een oude naam uit een vorige versie mag geen stand opleveren waar geen
 * stijl bij hoort — dan krijg je een scherm zonder achtergrond en geen enkele
 * aanwijzing waarom.
 */
export function resolveLook(sources: {
  cloud?: unknown;
  local?: unknown;
}): Look {
  if (isLook(sources.cloud)) return sources.cloud;
  if (isLook(sources.local)) return sources.local;
  return DEFAULT_LOOK;
}

/** De andere stand. Voor een knop die heen en weer schakelt. */
export function otherLook(current: Look): Look {
  return current === 'glass' ? 'black' : 'glass';
}
