import { describe, expect, it } from 'vitest';
import { PHONE_TABS, PHONE_TIKMAAT, phoneTabActief, phoneTabDoel, isLockPad } from './phoneChrome';

describe('phoneChrome', () => {
  it('heeft de vijf A17-tabs in deze volgorde', () => {
    expect(PHONE_TABS.map((t) => t.label)).toEqual(['Home', 'Desk', 'Agents', 'Trading', 'More']);
  });

  it('stuurt Home naar /mobile en laat de rest staan', () => {
    expect(phoneTabDoel('/')).toBe('/mobile');
    expect(phoneTabDoel('/agents')).toBe('/agents');
    expect(phoneTabDoel('/maps-3d')).toBe('/maps-3d');
    expect(phoneTabDoel('/trading')).toBe('/trading');
  });

  it('ziet /mobile als Home en /maps-3d als Desk', () => {
    const home = PHONE_TABS.find((t) => t.id === 'home')!;
    const desk = PHONE_TABS.find((t) => t.id === 'desk')!;
    const more = PHONE_TABS.find((t) => t.id === 'more')!;
    expect(phoneTabActief('/mobile', home)).toBe(true);
    expect(phoneTabActief('/', home)).toBe(true);
    expect(phoneTabActief('/agents', home)).toBe(false);
    expect(phoneTabActief('/maps-3d', desk)).toBe(true);
    expect(phoneTabActief('/agents', more)).toBe(false);
  });

  it('houdt Approve/Decline op 44px', () => {
    expect(PHONE_TIKMAAT).toBe(44);
  });

  it('ziet /lock en /lock/pin als slot, verder niets', () => {
    expect(isLockPad('/lock')).toBe(true);
    expect(isLockPad('/lock/pin')).toBe(true);
    expect(isLockPad('/mobile')).toBe(false);
    expect(isLockPad('/agents')).toBe(false);
  });
});
