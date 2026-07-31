/**
 * Lightweight typed event bus for AXE CORE HQ.
 *
 * - In-process pub/sub (no React context required)
 * - Optional mirror to window CustomEvent so existing listeners keep working
 * - Typed payloads via domain/events/axeEvents.ts
 */
import {
  type AxeEventMap,
  type AxeEventName,
  LEGACY_WINDOW_EVENTS,
} from '@/domain/events/axeEvents';

type Handler<T> = (payload: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Handler<unknown>>>();
  private history: Array<{ name: string; ts: number; payload: unknown }> = [];
  private maxHistory = 40;
  private mirrorToWindow = true;

  on<K extends AxeEventName>(name: K, handler: Handler<AxeEventMap[K]>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(name, handler);
  }

  once<K extends AxeEventName>(name: K, handler: Handler<AxeEventMap[K]>): () => void {
    const wrap: Handler<AxeEventMap[K]> = (payload) => {
      unsub();
      handler(payload);
    };
    const unsub = this.on(name, wrap);
    return unsub;
  }

  off<K extends AxeEventName>(name: K, handler: Handler<AxeEventMap[K]>): void {
    this.listeners.get(name)?.delete(handler as Handler<unknown>);
  }

  emit<K extends AxeEventName>(name: K, payload: AxeEventMap[K]): void {
    this.history.push({ name, ts: Date.now(), payload });
    if (this.history.length > this.maxHistory) this.history.shift();

    const set = this.listeners.get(name);
    if (set) {
      for (const h of set) {
        try {
          h(payload);
        } catch (err) {
          console.warn(`[eventBus] handler error on ${name}`, err);
        }
      }
    }

    if (this.mirrorToWindow && typeof window !== 'undefined') {
      const legacy = LEGACY_WINDOW_EVENTS[name];
      try {
        if (legacy) {
          // Prefer CustomEvent with detail when payload is object-like
          window.dispatchEvent(new CustomEvent(legacy, { detail: payload }));
        }
        // Always also fire typed bus name for new listeners on window
        window.dispatchEvent(new CustomEvent(name, { detail: payload }));
      } catch {
        /* SSR / non-DOM */
      }
    }
  }

  /** Last N emissions (debug / AI Core logs). */
  getHistory(): ReadonlyArray<{ name: string; ts: number; payload: unknown }> {
    return this.history;
  }

  clearHistory(): void {
    this.history = [];
  }

  setWindowMirror(enabled: boolean): void {
    this.mirrorToWindow = enabled;
  }
}

/** Singleton bus used across HQ. */
export const axeBus = new EventBus();

/** Convenience re-exports */
export const onAxeEvent = axeBus.on.bind(axeBus);
export const onceAxeEvent = axeBus.once.bind(axeBus);
export const emitAxeEvent = axeBus.emit.bind(axeBus);

/**
 * React-friendly subscribe helper (call from useEffect).
 * Returns unsubscribe.
 */
export function subscribeAxeEvent<K extends AxeEventName>(
  name: K,
  handler: (payload: AxeEventMap[K]) => void,
): () => void {
  return axeBus.on(name, handler);
}
