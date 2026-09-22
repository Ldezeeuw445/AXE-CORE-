/**
 * candleStore — waar de candle-series bewaard worden: IndexedDB in de app,
 * geheugen waar IndexedDB niet bestaat (tests, een omgeving die het blokkeert).
 *
 * IndexedDB en niet localStorage of user_settings: twintigduizend bars per serie
 * maal tientallen series is tientallen megabytes, en die horen op het apparaat,
 * niet in een instellingenrij die bij elke wijziging opnieuw verstuurd wordt.
 */
import type { CachedSeries } from '@/domain/tradingIntel/candleCache';

const DB = 'axe_candle_cache';
const STORE = 'series';
const VERSION = 1;

export interface CandleStore {
  get(key: string): Promise<CachedSeries | null>;
  put(key: string, series: CachedSeries): Promise<void>;
  keys(): Promise<string[]>;
  remove(key: string): Promise<void>;
}

function memoryStore(): CandleStore {
  const m = new Map<string, CachedSeries>();
  return {
    get: async k => m.get(k) ?? null,
    put: async (k, s) => { m.set(k, s); },
    keys: async () => [...m.keys()],
    remove: async k => { m.delete(k); },
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbStore(idb: IDBFactory): CandleStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => {
    dbPromise ??= new Promise((resolve, reject) => {
      const r = idb.open(DB, VERSION);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbPromise;
  };
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    get: async k => (await req((await tx('readonly')).get(k))) as CachedSeries | undefined ?? null,
    put: async (k, s) => { await req((await tx('readwrite')).put(s, k)); },
    keys: async () => ((await req((await tx('readonly')).getAllKeys())) as IDBValidKey[]).map(String),
    remove: async k => { await req((await tx('readwrite')).delete(k)); },
  };
}

let instance: CandleStore | null = null;

export function candleStore(): CandleStore {
  if (instance) return instance;
  const idb = typeof indexedDB !== 'undefined' ? indexedDB : null;
  instance = idb ? idbStore(idb) : memoryStore();
  return instance;
}

/** Test seam: een eigen opslag, of terug naar de standaard. */
export function __setCandleStore(store: CandleStore | null): void {
  instance = store;
}
