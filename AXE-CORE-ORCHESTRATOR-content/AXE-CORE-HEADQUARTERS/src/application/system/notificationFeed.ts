/** De bel blijft werken als Realtime wegvalt; één begrensde REST-aanroep tegelijk. */
export function startNotificationFeed<T>(options: {
  load: (signal: AbortSignal) => Promise<T[]>;
  changed: (rows: T[]) => void;
  failed: (message: string | null) => void;
  intervalMs?: number;
}): { refresh: () => void; stop: () => void } {
  let alive = true;
  let inFlight = false;
  let again = false;
  let controller: AbortController | null = null;

  const refresh = () => {
    if (!alive) return;
    if (inFlight) { again = true; return; }
    inFlight = true;
    controller = new AbortController();
    const active = controller;
    const timeout = setTimeout(() => active.abort(), 10_000);
    void options.load(active.signal).then(rows => {
      if (!alive) return;
      options.changed(rows);
      options.failed(null);
    }).catch((error: unknown) => {
      if (alive) options.failed(error instanceof Error ? error.message : 'Notification refresh failed');
    }).finally(() => {
      clearTimeout(timeout);
      inFlight = false;
      if (alive && again) { again = false; refresh(); }
    });
  };

  const interval = setInterval(refresh, options.intervalMs ?? 30_000);
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  refresh();
  return {
    refresh,
    stop: () => {
      alive = false;
      clearInterval(interval);
      controller?.abort();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    },
  };
}
