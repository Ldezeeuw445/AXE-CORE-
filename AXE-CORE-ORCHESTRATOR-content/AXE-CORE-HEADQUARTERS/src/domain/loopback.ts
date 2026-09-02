/**
 * Addresses that only mean something on the machine you are sitting at.
 *
 * ## The failure this exists to stop
 *
 * `127.0.0.1` is not a place. It is "whoever is asking", and that is a
 * different computer in each of the three hosts this app runs in. Every time
 * an address like that has been written down here, it worked on the Mac and
 * failed silently everywhere else:
 *
 *   · Embeddings asked 127.0.0.1:11434 from inside the phone shell — the
 *     PHONE's loopback, where nothing listens. 31 failed requests from one
 *     screen open, all swallowed by a fallback, for weeks.
 *   · Companion's tool calls discover a live port from a shared registry and
 *     then call it on 127.0.0.1. Discovery SUCCEEDS on the phone, so the call
 *     looks reachable and dies at the fetch — reported as "is the app
 *     running?", which sends the reader to a Mac app that is running fine.
 *
 * Both are the same bug and neither announced itself. A loopback address that
 * cannot be reached must say WHY, in one place, or every caller invents its
 * own wrong explanation.
 *
 * ## Why a domain module
 *
 * Which host is running is infrastructure's to know. What that means for an
 * address is a rule, it is the same rule for the bridge and the sidecar and
 * Ollama, and it is worth stating once where it can be tested without a
 * browser.
 */

/** Where the app is running, as far as reaching a local service goes. */
export type HostKind =
  /** The Tauri app, or a browser, on the Mac the services run on. */
  | 'this-machine'
  /** The Android shell. Its loopback is the phone's own. */
  | 'android-shell'
  /** Served from somewhere else entirely — the VPS, a deployed web build. */
  | 'remote';

/**
 * Whether this URL points at the caller's own machine.
 *
 * Deliberately literal about which names count. `0.0.0.0` is in the list
 * because it is written as an address far more often than it is meant as one,
 * and it behaves as loopback when a client dials it.
 */
export function isLoopbackUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;   // not a URL at all; not this module's problem
  }
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  // 127.0.0.0/8 in full: 127.1 and 127.0.0.1 are the same machine.
  //
  // Anchored at BOTH ends. `/^127\./` alone also matched
  // 127.0.0.1.evil.example.com -- a perfectly ordinary hostname that a
  // stranger controls, which this would then have called local and trusted.
  return /^127(\.\d{1,3}){1,3}$/.test(host);
}

export interface LoopbackVerdict {
  reachable: boolean;
  /**
   * Why not, in the reader's terms. Null when reachable.
   *
   * Names the host rather than the error, because the error is always some
   * flavour of "connection refused" and that is the least useful half.
   */
  because: string | null;
}

/**
 * Whether this host can reach that address, and what to say when it cannot.
 *
 * `service` is the name the reader knows the thing by — "AXE Companion", "the
 * local bridge" — so the message reads as a sentence about their setup rather
 * than about a socket.
 */
export function loopbackVerdict(url: string, host: HostKind, service: string): LoopbackVerdict {
  if (!isLoopbackUrl(url)) return { reachable: true, because: null };
  switch (host) {
    case 'this-machine':
      return { reachable: true, because: null };
    case 'android-shell':
      return {
        reachable: false,
        because: `${service} runs on the Mac. On the phone this address is the phone itself, where nothing is listening.`,
      };
    case 'remote':
      return {
        reachable: false,
        because: `${service} runs on the Mac and is not reachable from this build.`,
      };
  }
}
