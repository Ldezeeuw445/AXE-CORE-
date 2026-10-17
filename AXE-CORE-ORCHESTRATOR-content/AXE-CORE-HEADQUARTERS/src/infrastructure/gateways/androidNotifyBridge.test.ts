import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativeNotify, nativeNotifyAvailable, setNotifyPoll, vraagNotifyToestemming,
} from './androidNotifyBridge';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('androidNotifyBridge', () => {
  it('is stil zonder shell', () => {
    vi.stubGlobal('window', {});
    expect(nativeNotifyAvailable()).toBe(false);
    expect(nativeNotify('t', 'b', '1')).toBe(false);
    expect(setNotifyPoll({
      supabaseUrl: 'https://x.supabase.co', anonKey: 'k',
      accessToken: 'a', refreshToken: 'r', userId: 'u',
    })).toBe(false);
    expect(vraagNotifyToestemming()).toBe(false);
  });

  it('stuurt titel, tekst en id naar de shell', () => {
    const notify = (title: string, body: string, id: string) => {
      expect([title, body, id]).toEqual(['Yes needed', 'DEAL-002', 'n1']);
      return true;
    };
    vi.stubGlobal('window', { __AXE_ANDROID__: { notify } });
    expect(nativeNotifyAvailable()).toBe(true);
    expect(nativeNotify('Yes needed', 'DEAL-002', 'n1')).toBe(true);
  });

  it('geeft de sessie als JSON aan WorkManager', () => {
    let raw = '';
    vi.stubGlobal('window', {
      __AXE_ANDROID__: { setNotifyPoll: (j: string) => { raw = j; return true; } },
    });
    expect(setNotifyPoll({
      supabaseUrl: 'https://pqnngpcgbdwxavbatbia.supabase.co',
      anonKey: 'anon',
      accessToken: 'at',
      refreshToken: 'rt',
      userId: 'acff7a12-1111-481d-a7a9-cc07583b8069',
    })).toBe(true);
    expect(JSON.parse(raw)).toMatchObject({ refreshToken: 'rt', userId: 'acff7a12-1111-481d-a7a9-cc07583b8069' });
  });
});
