/**
 * The order panels are placed in, and the track sizes that align them.
 *
 * ## Why this is worth pulling out of the component
 *
 * The alignment rule in AccountColumns is genuinely subtle and was arrived at
 * by getting it wrong twice: giving each COLUMN a shared height fixed the
 * ragged bottom edge and left the cards inside stacking at their natural
 * heights, which reads worse than no alignment at all because the eye expects
 * a row and does not get one. What actually works is one grid filled ROW BY
 * ROW, so a CSS grid row can be as tall as its tallest cell.
 *
 * And on a narrow screen that same order is wrong — collapsed to one column it
 * becomes book, book, book, stats, stats, stats, with every account's numbers
 * two accounts away from its own book.
 *
 * Both of those are decisions about ORDER, which is a fact about a list and not
 * about React. They had no test: the rendering is what would break, silently,
 * and a screenshot is the only thing that would have caught it. Here they can
 * be stated as what they are.
 */

/** One band across the layout: how to draw it, and whether it absorbs slack. */
export interface PanelRow {
  id: string;
  /** Marks the row that soaks up leftover vertical space, so the page fills. */
  grow?: boolean;
}

export interface PanelCell {
  rowId: string;
  itemKey: string;
}

/**
 * The cells, in the order they must appear in the DOM.
 *
 * Wide is row-major: every item's first panel, then every item's second. That
 * IS the alignment — a grid row is as tall as its tallest cell and the rest
 * stretch to match, so the layout does "take the biggest and make the rest that
 * size" without anyone guessing a pixel height.
 *
 * Narrow is item-major: each item complete, in order. There is no row to align
 * on a single-column screen, so alignment has nothing left to buy and grouping
 * is all that is left to get right.
 */
export function panelOrder(
  itemKeys: readonly string[],
  rows: readonly PanelRow[],
  wide: boolean,
): PanelCell[] {
  const cells: PanelCell[] = [];
  if (wide) {
    for (const row of rows) for (const itemKey of itemKeys) cells.push({ rowId: row.id, itemKey });
  } else {
    for (const itemKey of itemKeys) for (const row of rows) cells.push({ rowId: row.id, itemKey });
  }
  return cells;
}

/**
 * The `grid-template-rows` value for the wide layout.
 *
 * `min-content` for ordinary rows so a short card stays short, and
 * `minmax(0, 1fr)` for the growing one. The 0 minimum matters: `1fr` alone
 * refuses to shrink below its content, which is how a long list stops
 * scrolling and starts pushing the page instead.
 */
export function panelRowTracks(rows: readonly PanelRow[]): string {
  return rows.map(r => (r.grow ? 'minmax(0, 1fr)' : 'min-content')).join(' ');
}

/** The `grid-template-columns` value: one equal, shrinkable track per item. */
export function panelColumnTracks(itemCount: number): string {
  return `repeat(${itemCount}, minmax(0, 1fr))`;
}
