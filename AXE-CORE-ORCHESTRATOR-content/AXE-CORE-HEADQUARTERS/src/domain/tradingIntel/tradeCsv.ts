/**
 * Turn an account's closed trades into a CSV the app can read back.
 *
 * ## Why export at all when the history is already fetched
 *
 * The importer exists for accounts we cannot reach. Ours we can — MetaAPI
 * hands us every deal — so importing them by hand would be turning something
 * automatic back into manual work. The useful direction is the other one:
 * produce the file from what we already have, so a broker export becomes
 * something the app can make rather than something you go and fetch from a
 * terminal. That is the difference between a step you can automate and a step
 * that always needs a person.
 *
 * ## Round-trip or it is not a format
 *
 * The columns and their spelling match what parseJournalCsv accepts, and the
 * tests assert that exporting and re-importing gives back the same trades. An
 * export nobody can read back is a text file, not an interchange format — and
 * the moment those two drift, the import silently loses a column and the
 * numbers quietly change.
 */

/** The fields an exported trade carries. Structurally satisfied by JournalTrade. */
export interface ExportableTrade {
  symbol: string;
  side: 'buy' | 'sell' | null;
  volume: number | null;
  openTime: string | null;
  closeTime: string | null;
  openPrice: number | null;
  closePrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number;
  swap: number;
  profit: number;
  comment?: string | null;
}

/**
 * Header names chosen to match the importer's first alias for each column, so
 * a file this produces is the one the parser recognises most directly.
 */
const COLUMNS = [
  'Symbol', 'Type', 'Volume', 'Open Time', 'Close Time',
  'Open Price', 'Close Price', 'S/L', 'T/P',
  'Commission', 'Swap', 'Profit', 'Comment',
] as const;

/**
 * Quote a cell only when it needs it, and double any quote inside.
 *
 * A comment like `AXE fib, retested` carries a comma and would otherwise split
 * into two columns — shifting Profit one place left and turning a result into
 * a price. The importer already handles quoted cells; this is the half that
 * has to produce them.
 */
function cell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (s === '') return '';
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A number, or an empty cell — never a zero standing in for "unknown". */
function num(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value);
}

export function tradesToCsv(trades: ExportableTrade[]): string {
  const lines = [COLUMNS.join(',')];
  for (const t of trades) {
    lines.push([
      cell(t.symbol),
      cell(t.side ?? ''),
      num(t.volume),
      cell(t.openTime),
      cell(t.closeTime),
      num(t.openPrice),
      num(t.closePrice),
      num(t.stopLoss),
      num(t.takeProfit),
      num(t.commission),
      num(t.swap),
      num(t.profit),
      cell(t.comment ?? ''),
    ].join(','));
  }
  // A trailing newline: some tools drop the last row without one.
  return lines.join('\n') + '\n';
}

/**
 * A filename that says which account and which day, so two exports never
 * collide in a downloads folder and neither becomes anonymous.
 */
export function exportFilename(accountLabel: string, at = new Date()): string {
  const slug = accountLabel.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'account';
  return `axe-${slug}-${at.toISOString().slice(0, 10)}.csv`;
}
