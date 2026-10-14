import { afterEach, describe, expect, it, vi } from 'vitest';
import { startNotificationFeed } from './notificationFeed';

describe('REST fallback for notifications', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const setup = () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', new EventTarget());
  };
  it('keeps refreshing when no realtime event arrives', async () => {
    setup();
    const changed = vi.fn();
    let rows = ['initial'];
    const feed = startNotificationFeed({ load: async () => rows, changed, failed: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    rows = ['new outage'];
    await vi.advanceTimersByTimeAsync(30_000);
    expect(changed).toHaveBeenLastCalledWith(['new outage']);
    feed.stop();
  });
  it('coalesces incoming events while a query is still running', async () => {
    setup();
    let resolve!: (rows: string[]) => void;
    const load = vi.fn(() => new Promise<string[]>(r => { resolve = r; }));
    const feed = startNotificationFeed({ load, changed: vi.fn(), failed: vi.fn() });
    feed.refresh(); feed.refresh(); feed.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    resolve(['initial']);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    feed.stop();
  });
  it('does not let an old user query update the next session', async () => {
    setup();
    let resolve!: (rows: string[]) => void;
    const changed = vi.fn();
    const feed = startNotificationFeed({ load: () => new Promise<string[]>(r => { resolve = r; }), changed, failed: vi.fn() });
    feed.stop();
    resolve(['previous user']);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).not.toHaveBeenCalled();
  });
  it('makes a failed feed visible and clears the error after recovery', async () => {
    setup();
    const failed = vi.fn();
    let broken = true;
    const feed = startNotificationFeed({ load: async () => { if (broken) throw new Error('database unavailable'); return []; }, changed: vi.fn(), failed });
    await vi.advanceTimersByTimeAsync(0);
    expect(failed).toHaveBeenLastCalledWith('database unavailable');
    broken = false;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(failed).toHaveBeenLastCalledWith(null);
    feed.stop();
  });
});
