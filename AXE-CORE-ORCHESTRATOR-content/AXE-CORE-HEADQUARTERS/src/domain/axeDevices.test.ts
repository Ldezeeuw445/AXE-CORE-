import { describe, it, expect } from 'vitest';
import {
  capabilitiesVoor,
  deviceTypeVoor,
  isOnline,
  kiesDeviceId,
  naamVoor,
  platformVanRuntime,
  samenvoegen,
  tijdGeleden,
  voegWorkerToe,
  type AxeDevice,
} from './axeDevices';

describe('online volgt uit last_seen', () => {
  const nu = Date.parse('2026-09-18T18:00:00Z');

  it('is online binnen het venster, daarna niet', () => {
    expect(isOnline('2026-09-18T17:59:30Z', nu)).toBe(true);
    expect(isOnline('2026-09-18T17:50:00Z', nu)).toBe(false);
    expect(isOnline(null, nu)).toBe(false);
    expect(isOnline('niet-een-datum', nu)).toBe(false);
  });
});

describe('vaste device_id', () => {
  it('neemt een echte hostname, niet localhost', () => {
    expect(kiesDeviceId('mac-mini-van-luka-5', 'uuid-1')).toBe('mac-mini-van-luka-5');
    expect(kiesDeviceId('localhost', 'uuid-1')).toBe('uuid-1');
    expect(kiesDeviceId('mac-mini-van-luka-5.local', 'uuid-1')).toBe('mac-mini-van-luka-5');
    expect(kiesDeviceId('mini-van-luka-5.home', 'uuid-1')).toBe('mini-van-luka-5');
  });
});

describe('platform en kunnen', () => {
  it('herkent Android uit de user-agent, Mac uit os', () => {
    expect(platformVanRuntime({ android: true })).toBe('android');
    expect(platformVanRuntime({ os: 'macos' })).toBe('macos');
    expect(platformVanRuntime({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A175F) AppleWebKit/537.36' })).toBe('android');
  });

  it('Samsung is client, Mac is host', () => {
    expect(deviceTypeVoor('android')).toBe('mobile');
    expect(deviceTypeVoor('macos')).toBe('desktop');
    expect(capabilitiesVoor('android', 'mobile')).toContain('remote_terminal_client');
    expect(capabilitiesVoor('android', 'mobile')).toContain('native_notify');
    expect(capabilitiesVoor('android', 'mobile')).not.toContain('local_filesystem');
    expect(capabilitiesVoor('macos', 'desktop')).toContain('terminal_host');
  });

  it('leest het Samsung-model uit de user-agent', () => {
    expect(naamVoor('android', null, 'Mozilla/5.0 (Linux; Android 14; SM-A175F Build/UP1A)')).toBe('SM-A175F');
    expect(naamVoor('android', null, 'Mozilla/5.0')).toBe('Samsung');
  });
});

describe('samenvoegen verzint geen tweede rij', () => {
  it('plakt een computer-worker op dezelfde device_id', () => {
    const a: AxeDevice = {
      device_id: 'mac-mini-van-luka-5',
      device_name: 'Mac mini',
      device_type: 'desktop',
      platform: 'macos',
      app_version: '1.0.0',
      capabilities: ['desktop'],
      last_seen: '2026-09-18T17:59:00Z',
      ditToestel: true,
      bron: 'installatie',
    };
    const b: AxeDevice = {
      ...a,
      ditToestel: false,
      bron: 'computer_worker',
      capabilities: ['local_runtime'],
      last_seen: '2026-09-18T18:00:00Z',
    };
    const uit = samenvoegen([a, voegWorkerToe(b, true)]);
    expect(uit).toHaveLength(1);
    expect(uit[0].capabilities).toEqual(expect.arrayContaining(['desktop', 'local_runtime']));
    expect(uit[0].ditToestel).toBe(true);
    expect(uit[0].last_seen).toBe('2026-09-18T18:00:00Z');
  });

  it('plakt kale Mac-installatie op mini-van-luka-5.home, iMac blijft apart', () => {
    const installatie: AxeDevice = {
      device_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      device_name: 'Mac',
      device_type: 'desktop',
      platform: 'macos',
      app_version: '1.0.0',
      capabilities: ['desktop', 'local_filesystem'],
      last_seen: '2026-10-17T21:00:00Z',
      ditToestel: false,
      bron: 'installatie',
    };
    const mini: AxeDevice = {
      device_id: 'worker-mini',
      device_name: 'mini-van-luka-5.home',
      device_type: 'desktop',
      platform: 'macos',
      app_version: null,
      capabilities: ['desktop', 'local_runtime', 'terminal_host'],
      last_seen: '2026-10-17T21:01:00Z',
      ditToestel: false,
      bron: 'computer_worker',
    };
    const imac: AxeDevice = {
      device_id: 'worker-imac',
      device_name: 'imac-1.home',
      device_type: 'desktop',
      platform: 'macos',
      app_version: null,
      capabilities: ['desktop', 'local_runtime'],
      last_seen: '2026-10-17T21:01:00Z',
      ditToestel: false,
      bron: 'computer_worker',
    };
    const uit = samenvoegen([installatie, mini, imac]);
    expect(uit).toHaveLength(2);
    const namen = uit.map((d) => d.device_name).sort();
    expect(namen).toEqual(['imac-1.home', 'mini-van-luka-5.home']);
    const samengevoegd = uit.find((d) => d.device_name.includes('mini'))!;
    expect(samengevoegd.capabilities).toEqual(expect.arrayContaining([
      'desktop', 'local_filesystem', 'local_runtime', 'terminal_host',
    ]));
    expect(uit.some((d) => d.device_name === 'Mac')).toBe(false);
  });
});

describe('tijdGeleden', () => {
  it('zegt never seen zonder timestamp', () => {
    expect(tijdGeleden(null, Date.parse('2026-09-18T18:00:00Z'))).toBe('never seen');
    expect(tijdGeleden('2026-09-18T17:59:50Z', Date.parse('2026-09-18T18:00:00Z'))).toBe('just now');
  });
});
