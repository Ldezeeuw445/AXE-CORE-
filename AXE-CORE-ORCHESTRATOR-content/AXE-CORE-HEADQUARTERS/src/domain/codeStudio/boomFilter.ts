/**
 * Wat de bestandsboom in Code niet laat zien (BOUWLIJST "UI nog open", 20 nov).
 *
 * De boom begon met tien `_backup_` / `_rollback_`-mappen: kopieën die
 * scripts tijdens herstel- en terugdraairondes achterlaten. Ze staan er nog,
 * maar horen niet bovenaan wat je opent om te werken. Ook macOS-ruis weg.
 */
const VERBORGEN = [/^_backup_/i, /^_rollback_/i, /^\.DS_Store$/];

export function zichtbaarInBoom(naam: string): boolean {
  return !VERBORGEN.some((r) => r.test(naam));
}
