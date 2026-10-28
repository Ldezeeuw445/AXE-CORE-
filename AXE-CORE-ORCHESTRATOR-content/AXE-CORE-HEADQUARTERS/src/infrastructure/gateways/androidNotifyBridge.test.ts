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
      apiOrigin: 'https://api.axecompanion.com', deviceToken: 'axe_dev_x', deviceId: 'samsung',
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

  it('geeft het device-token als JSON aan WorkManager', () => {
    let raw = '';
    vi.stubGlobal('window', {
      __AXE_ANDROID__: { setNotifyPoll: (j: string) => { raw = j; return true; } },
    });
    expect(setNotifyPoll({
      apiOrigin: 'https://api.axecompanion.com',
      deviceToken: 'axe_dev_ab',
      deviceId: 'samsung-a17',
    })).toBe(true);
    expect(JSON.parse(raw)).toMatchObject({
      apiOrigin: 'https://api.axecompanion.com',
      deviceToken: 'axe_dev_ab',
      deviceId: 'samsung-a17',
    });
    expect(raw).not.toContain('anon');
    expect(raw).not.toContain('refreshToken');
  });
});
