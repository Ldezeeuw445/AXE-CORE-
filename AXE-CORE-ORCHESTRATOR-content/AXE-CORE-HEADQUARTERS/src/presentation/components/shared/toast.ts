import { toast as sonnerToast } from 'sonner';

/**
 * The one place non-fatal failures/successes become visible. Before this,
 * a lot of the app either used a blocking `alert()` or silently swallowed
 * errors (`catch {}`) — both mean a real failure with no honest, visible
 * trace for the user. This doesn't replace ErrorBoundary (that's for fatal
 * render crashes); this is for "the save/fetch/patch failed, here's why,
 * and the app keeps working" — the flawless-not-fabricated bar applied to
 * every non-fatal error path, not just the network calls that already had it.
 */
export const toast = {
  error: (message: string) => sonnerToast.error(message, { duration: 6000 }),
  success: (message: string) => sonnerToast.success(message, { duration: 3000 }),
  info: (message: string) => sonnerToast(message, { duration: 4000 }),
};
