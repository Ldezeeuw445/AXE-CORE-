/**
 * Welk icoon en welke kleur elke trading-tab krijgt.
 *
 * ## Waarom dit bestaat
 *
 * De tabs staan als kale iconen naast de composer -- de namen zijn weg, want
 * twaalf labels in die strook is een tweede navigatie. Je ziet de naam pas als
 * je erover gaat, en dan in de kleur van die tab.
 *
 * Dat werkt alleen als de koppeling icoon-kleur-tab VAST is. Verspringt hij,
 * dan is er geen kleur meer om te onthouden en is het weer twaalf gelijke
 * knopjes. Vandaar één tabel, hier, met een test die hem compleet houdt.
 *
 * ## Waarom kleur hier wél mag
 *
 * Wet 10 zegt: kleur in de letters, nooit in een vlak. Dat is precies wat hier
 * gebeurt -- de NAAM kleurt, en het icoon licht mee op. De knop zelf blijft
 * leeg.
 */

export interface TabStijl {
  /** Naam van een lucide-icoon. De component zet hem om; hier geen JSX, want
   *  dan is dit geen domeinmodule meer. */
  icoon: string;
  /** De eigen kleur van deze tab, als hex. */
  kleur: string;
}

/**
 * De twaalf tabs van de desk.
 *
 * De kleuren lopen van koel naar warm in de vololgorde waarin je een beslissing
 * doorloopt -- chart en research zijn koel (kijken), funnel en scorecard zijn
 * warm (oordelen), accounts is groen (geld). Niet omdat het moet, maar omdat
 * een willekeurige verdeling twaalf kleuren zonder betekenis oplevert.
 */
export const TAB_STIJL: Readonly<Record<string, TabStijl>> = {
  chart:      { icoon: 'CandlestickChart', kleur: '#22D3EE' },
  research:   { icoon: 'Telescope',        kleur: '#38BDF8' },
  brain:      { icoon: 'Brain',            kleur: '#8B7CF6' },
  memory:     { icoon: 'Database',         kleur: '#A78BFA' },
  frameworks: { icoon: 'Blocks',           kleur: '#C084FC' },
  strategies: { icoon: 'FlaskConical',     kleur: '#F472B6' },
  correlatie: { icoon: 'Waypoints',        kleur: '#FB7185' },
  kalender:   { icoon: 'CalendarDays',     kleur: '#FB923C' },
  funnel:     { icoon: 'Filter',           kleur: '#F5A524' },
  scorecard:  { icoon: 'Trophy',           kleur: '#FACC15' },
  accounts:   { icoon: 'Wallet',           kleur: '#34D399' },
  demo:       { icoon: 'BookOpen',         kleur: '#2DD4BF' },
};

/** De terugval voor een tab die er later bij komt en hier nog niet staat. */
export const TAB_TERUGVAL: TabStijl = { icoon: 'Circle', kleur: '#9CA3AF' };

export function stijlVan(id: string): TabStijl {
  return TAB_STIJL[id] ?? TAB_TERUGVAL;
}
