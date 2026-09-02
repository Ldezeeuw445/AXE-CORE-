/**
 * What a colour on this screen is allowed to mean.
 *
 * ## The problem, measured
 *
 * 1274 hex literals in the presentation layer on 2026-08-27, and the shape of
 * the list is the whole story: THREE greens (#10B981, #34D399, #6EE7B7), three
 * reds, two ambers, four purples. The same meaning in a different shade
 * depending on which component it was written in, and no way for a reader to
 * know whether the difference means anything. It usually did not.
 *
 * Half the existing tokens are named after the colour rather than the job —
 * `--green`, `--pink`, `--accent-cyan`. A token called `--green` can never stop
 * being green, so the day green stops meaning "happened" the token is a lie
 * and the only remaining fix is to touch every call site. Naming by meaning is
 * what makes the palette changeable at all.
 *
 * ## The vocabulary
 *
 * Deliberately small. A palette a reader can hold in their head is worth more
 * than a precise one they have to look up, and every additional meaning makes
 * the previous ones vaguer.
 *
 *   happened   something is done, filled, live, confirmed
 *   budget     a limit, a cost, a gap in the data — not broken, but not free
 *   broken     it failed, and someone has to do something
 *   structure  navigation, selection, the shape of the thing — not a state
 *   idle       nothing to report, and that is fine
 *
 * ## The rule that keeps it honest
 *
 * Tint may vary for legibility. HUE may not vary for emphasis. A brighter
 * green for a hovered row is fine; a different green because the designer
 * wanted variety is what turned three greens into noise. When something needs
 * to stand out more, reach for weight, size or opacity — never another hue,
 * because every hue in this list already means something else.
 *
 * Nothing here is a colour value. Components ask for a CSS variable and the
 * stylesheet decides what it looks like, so the palette can be re-tuned in one
 * file. See `src/app/index.css`.
 */

export type Meaning = 'happened' | 'budget' | 'broken' | 'structure' | 'idle';

/** The CSS variable for a meaning, ready to drop into a style. */
export function meaningVar(meaning: Meaning): string {
  return `var(--m-${meaning})`;
}

/**
 * The dim companion, for grounds and borders.
 *
 * Same hue at low alpha. It exists so that a panel wanting a tinted background
 * does not reach for a different colour to get one — which is exactly how
 * #34D399 and #6EE7B7 got in.
 */
export function meaningVarDim(meaning: Meaning): string {
  return `var(--m-${meaning}-dim)`;
}

/**
 * Whether a test, probe or connection succeeded.
 *
 * `testing` is deliberately idle rather than its own colour: in progress is
 * not a result, and giving it one teaches the reader to read colour before the
 * answer exists.
 */
export function meaningOfTest(status: 'ok' | 'fail' | 'testing' | 'idle' | undefined): Meaning {
  if (status === 'ok') return 'happened';
  if (status === 'fail') return 'broken';
  return 'idle';
}

/**
 * What a pipeline stage's outcome means.
 *
 * `empty` is idle, not amber. It was written here as amber first — a stage
 * with nothing in it looks like a gap — but cycleJournal.ts defines it as "ran
 * and had nothing to say", and argues at length that this is the case NOT
 * worth chasing; a crossover detector holds on most bars and that is correct.
 * Amber on every quiet row is decoration, and decoration is what makes the
 * amber that matters invisible.
 *
 * What amber cannot express here is persistence: research being empty once is
 * normal, and being empty for twelve days is the bug that actually happened.
 * A colour on one row is the wrong instrument for that, and pretending
 * otherwise would have made this feel solved.
 */
export function meaningOfStage(status: 'ok' | 'empty' | 'failed'): Meaning {
  switch (status) {
    case 'ok': return 'happened';
    case 'empty': return 'idle';
    case 'failed': return 'broken';
  }
}

/**
 * What an account's attempt to trade means.
 *
 * A refusal is amber, not red. The risk layer declining is the system working;
 * red is for the case where nobody decided anything because something broke.
 */
export function meaningOfTradeAttempt(input: { orderId: string | null; refusedBecause: string | null }): Meaning {
  if (input.orderId) return 'happened';
  if (input.refusedBecause) return 'budget';
  return 'idle';
}

/**
 * What an age means, given how fresh the reader needed it.
 *
 * Stale data is amber and never red, for the same reason a refusal is: an old
 * number is usually still the best answer available, and colouring it as a
 * failure invites throwing it away. Unknown age is idle — not old.
 */
export function meaningOfFreshness(ageMs: number | null, staleAfterMs: number): Meaning {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'idle';
  return ageMs > staleAfterMs ? 'budget' : 'happened';
}
