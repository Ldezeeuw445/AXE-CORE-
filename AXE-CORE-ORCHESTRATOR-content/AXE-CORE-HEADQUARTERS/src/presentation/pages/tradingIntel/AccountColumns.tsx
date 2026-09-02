/**
 * Account panels, laid out so the comparison is honest on a desk and readable
 * on a phone — which turn out to need opposite arrangements.
 *
 * ## Wide: a grid filled row by row
 *
 * The first attempt gave each COLUMN one shared height. That fixed the ragged
 * bottom edge and missed the actual problem: the cards inside a column still
 * stacked at their natural heights, so OANDA's book (164 closed trades) pushed
 * its Stats card far below MT5's (11 trades). Three columns of equal height
 * with their contents at different heights reads worse than no alignment at
 * all, because the eye expects a row and does not get one.
 *
 * So on a wide screen the accounts and their cards are ONE grid, filled row by
 * row: row 1 is every account's first card, row 2 every account's second. A
 * CSS grid row is as tall as its tallest cell and every other cell stretches to
 * match — "take the biggest and make the rest that size", done by the layout
 * instead of a guessed pixel height.
 *
 * ## Narrow: one account at a time, in full
 *
 * That same row-major order is wrong on a phone. Collapsed to one column it
 * becomes book, book, book, stats, stats, stats — every account's numbers
 * separated from its own book by two other accounts. There is no row to align
 * on a single-column screen, so the alignment has nothing left to buy and the
 * grouping is all that matters: each account is rendered whole, in order.
 *
 * The switch is a real measurement, not a CSS guess, because the two orders are
 * different DOM sequences rather than different widths.
 */
import { type ReactNode } from 'react';
import { useIsWide } from '@/presentation/hooks/useIsWide';
import { panelOrder, panelRowTracks, panelColumnTracks } from '@/domain/panelGrid';


/**
 * One row of the grid: a renderer per account.
 *
 * `grow` marks the row that should absorb leftover vertical space, so the panel
 * fills the page instead of leaving half of it empty under short cards.
 */
export interface AccountRow<T> {
  id: string;
  render: (item: T) => ReactNode;
  grow?: boolean;
}

export function AccountGrid<T>({
  items, keyOf, rows, empty,
}: {
  items: T[];
  keyOf: (item: T) => string;
  rows: Array<AccountRow<T>>;
  empty?: ReactNode;
}) {
  const wide = useIsWide();
  if (!items.length) return <>{empty ?? null}</>;

  if (!wide) {
    // Phone and tablet: each account complete, in order, so its stats sit
    // directly under its own book.
    return (
      <div className="space-y-4">
        {items.map(item => (
          <div key={keyOf(item)} className="space-y-2 min-w-0">
            {rows.map(row => (
              <div key={row.id} className="min-w-0">{row.render(item)}</div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // The order and the track sizes come from domain/panelGrid, where they are
  // stated as what they are -- facts about a list -- and tested. They used to
  // live inline, which meant the one thing that could silently regress here
  // was the one thing only a screenshot would have caught.
  const byKey = new Map(items.map(item => [keyOf(item), item]));
  const renderers = new Map(rows.map(row => [row.id, row.render]));

  return (
    <div
      className="grid gap-3 items-stretch"
      style={{
        gridTemplateColumns: panelColumnTracks(items.length),
        gridTemplateRows: panelRowTracks(rows),
      }}
    >
      {panelOrder(items.map(keyOf), rows, true).map(cell => (
        // h-full is what makes the shorter cards stretch to their row.
        <div key={`${cell.rowId}:${cell.itemKey}`} className="min-w-0 min-h-0 h-full">
          {renderers.get(cell.rowId)?.(byKey.get(cell.itemKey) as T)}
        </div>
      ))}
    </div>
  );
}

/**
 * A region that scrolls instead of stretching its card.
 *
 * The alignment above only holds if the long content gives up growing. A list
 * of 164 closed trades has to scroll in place; otherwise it sets the row height
 * for everyone and the two short accounts get a screen of empty space.
 */
export function ScrollArea({ children, max = 300 }: { children: ReactNode; max?: number }) {
  return (
    <div className="overflow-y-auto pr-0.5" style={{ maxHeight: max }}>
      {children}
    </div>
  );
}
