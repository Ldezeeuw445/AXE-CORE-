/**
 * The model running on the phone itself, reachable from this web app.
 *
 * AXE Core's CORE tab is a WebView inside the Android shell, not a native
 * screen — so when there is no signal, the page is what Luka is looking at and
 * the on-device model is the only thing left that can answer. A WebView cannot
 * load a 657MB `.task` model, so the native side does it and answers on our
 * behalf through the `__AXE_ANDROID__` bridge.
 *
 * What this is NOT: a peer of the cloud providers. It is Gemma 3 1B — it can
 * explain, summarise and reason a little, and it cannot use a tool, reach the
 * VPS or see any live data. It answers only when every real provider has
 * already failed, and the caller is told the answer came from the phone so the
 * UI can say so rather than passing it off as AXE proper.
 *
 * See LocalModel.kt for the guard that strips invented market claims: a 1B
 * model asked about equity offline will cheerfully make up a number, and that
 * gets removed on the native side before the text ever reaches this file.
 */

interface AxeAndroidBridgeShape {
  localModelReady?: () => boolean;
  askLocal?: (prompt: string, callbackId: string) => void;
}

function bridge(): AxeAndroidBridgeShape | null {
  if (typeof window === 'undefined') return null;
  const b = (window as unknown as Record<string, unknown>).__AXE_ANDROID__;
  return (b as AxeAndroidBridgeShape) ?? null;
}

/** True only inside the Android shell, with a model file actually present. */
export function onDeviceModelAvailable(): boolean {
  const b = bridge();
  if (!b?.askLocal || !b.localModelReady) return false;
  try {
    return b.localModelReady();
  } catch {
    return false;
  }
}

type Pending = { resolve: (text: string) => void; reject: (err: Error) => void; timer: number };
const pending = new Map<string, Pending>();

/**
 * Installed once, lazily. The native side calls this when generation finishes;
 * arguments arrive URI-encoded because the model emits quotes and newlines
 * freely and those do not survive being pasted into a JS string literal.
 */
function ensureCallback(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__axeLocalReply) return;
  w.__axeLocalReply = (id: string, text: string, error: string) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    window.clearTimeout(entry.timer);
    if (error) entry.reject(new Error(error));
    else if (!text?.trim()) entry.reject(new Error('on-device model returned nothing'));
    else entry.resolve(text);
  };
}

/**
 * Ask the phone. Rejects rather than returning a placeholder — a caller that
 * cannot get a real answer must say so, not invent one.
 *
 * Measured on the A17: ~6s for a short answer once the model is warm, ~17s the
 * first time. The timeout is generous because the alternative offline is no
 * answer at all, but it is not unbounded: a hung bridge would otherwise leave
 * the composer spinning forever.
 */
export async function askOnDeviceModel(prompt: string, timeoutMs = 60_000): Promise<string> {
  const b = bridge();
  if (!b?.askLocal) throw new Error('not running inside the AXE Android shell');
  ensureCallback();

  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error(`on-device model timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });
    try {
      b.askLocal!(prompt, id);
    } catch (e) {
      pending.delete(id);
      window.clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
