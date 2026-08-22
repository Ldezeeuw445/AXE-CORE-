/**
 * WebView — one renderer for a web page, and only one.
 *
 * WHAT THIS REPLACES, AND WHY IT HAD TO GO
 *
 * This file used to hold three renderers for a single URL: an iframe, an
 * Airtop cloud window, and a scraped text preview. Which one you got depended
 * on a hand-written list of "sites known to block iframes" and on which
 * fallback happened to answer first, so the same address could render three
 * different ways on three different days.
 *
 * The list was the deeper problem. X-Frame-Options and CSP frame-ancestors are
 * set by the SITE. Any list of who sets them is a guess that can only ever be
 * incomplete, and every site not on it failed the same way: a silent blank
 * rectangle with no error, because a blocked frame does not tell the embedder
 * anything.
 *
 * LiveBrowserView is a real headless Chromium on the VPS — screenshotted,
 * clickable, typeable. It works everywhere because it IS a browser rather than
 * something asking a site's permission to be embedded. It is also the exact
 * session the agent drives, so what is on screen and what AXE acts on cannot
 * drift apart.
 *
 * The old implementation is in git (see the commit that introduced this file's
 * current shape) rather than kept here as dead code.
 */
import LiveBrowserView from '@/presentation/components/browser/LiveBrowserView';

interface WebViewProps {
  url: string;
  onTitleChange?: (title: string) => void;
  /** Ask the page for its phone layout, not a narrower desktop one. */
  mobile?: boolean;
  /** Handed up so the agent panel can drive the session being watched. */
  onSession?: (sessionId: string | null) => void;
}

export default function WebView({ url, onTitleChange, mobile, onSession }: WebViewProps) {
  return (
    <LiveBrowserView
      url={url}
      mobile={mobile}
      onTitleChange={onTitleChange}
      onSession={onSession}
    />
  );
}
