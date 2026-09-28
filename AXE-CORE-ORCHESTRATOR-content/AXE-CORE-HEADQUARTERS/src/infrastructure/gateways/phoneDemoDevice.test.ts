/**
 * Het nep-toestel als toestandsmachine.
 *
 * Wat hier telt is dat een tik het scherm verspringt zoals een echte tik dat
 * zou doen, en dat `ui_dump` daarna de elementen van het níeuwe scherm geeft —
 * anders bouw je de device manager tegen een toestel dat nooit beweegt. De
 * PNG-kant blijft buiten beeld: die hoort bij de browser, deze tests draaien
 * in Node.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEMO_DEVICE, demoDevices, demoElements, demoLook, demoDo, demoScreenId, resetDemoDevice,
} from './phoneDemoDevice';
import { isA17Model } from '@/domain/phone/a17';

beforeEach(() => resetDemoDevice());

describe('demo device', () => {
  it('presents itself as an A17 that adb can use', () => {
    expect(isA17Model(DEMO_DEVICE.model)).toBe(true);
    const { devices } = demoDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].state).toBe('device');
  });

  it('starts on the home screen with tappable app tiles', () => {
    expect(demoScreenId()).toBe('home');
    const els = demoElements();
    expect(els.some(e => e.label === 'Chrome' && e.tap)).toBe(true);
    // Elk element draagt een vak, zodat het paneel er een draadscherm van tekent.
    expect(els.every(e => typeof e.w === 'number' && typeof e.h === 'number')).toBe(true);
  });

  it('moves to Chrome when its tile is tapped, by label', () => {
    demoDo('tap', { label: 'Chrome' });
    expect(demoScreenId()).toBe('chrome');
    const dump = demoLook('ui_dump');
    expect(dump.elements?.some(e => e.editable)).toBe(true); // het adresveld
  });

  it('taps by coordinate too, hitting whatever box the point falls in', () => {
    const settings = demoElements().find(e => e.label === 'Settings')!;
    demoDo('tap', { x: settings.x, y: settings.y });
    expect(demoScreenId()).toBe('settings');
  });

  it('HOME always returns to the home screen', () => {
    demoDo('tap', { label: 'Settings' });
    expect(demoScreenId()).toBe('settings');
    demoDo('key', { key: 'HOME' });
    expect(demoScreenId()).toBe('home');
  });

  it('launches a known package straight to its screen', () => {
    demoDo('launch', { package: 'com.axecore.core' });
    expect(demoScreenId()).toBe('axecore');
  });

  it('reports its size as the A17 screen', () => {
    expect(demoLook('screen_size').stdout).toContain('1080x2340');
  });
});
