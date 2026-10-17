import { describe, expect, it } from 'vitest';
import { PHONE_TABS, PHONE_TIKMAAT, phoneTabActief, phoneTabDoel, isLockPad } from './phoneChrome';

describe('phoneChrome', () => {
  it('heeft de vijf A17-tabs in deze volgorde', () => {
    expect(PHONE_TABS.map((t) => t.label)).toEqual(['Home', 'Trading', 'AXE', 'Memory', 'More']);
  });

  it('stuurt Home naar /mobile en More naar /apps', () => {
    expect(phoneTabDoel('/')).toBe('/mobile');
    expect(phoneTabDoel('/agents')).toBe('/agents');
    expect(phoneTabDoel('/trading')).toBe('/trading');
    expect(phoneTabDoel('/apps')).toBe('/apps');
  });

  it('ziet /mobile als Home en /trading als Trading', () => {
    const home = PHONE_TABS.find((t) => t.id === 'home')!;
    const trading = PHONE_TABS.find((t) => t.id === 'trading')!;
    const more = PHONE_TABS.find((t) => t.id === 'more')!;
    expect(phoneTabActief('/mobile', home)).toBe(true);
    expect(phoneTabActief('/', home)).toBe(true);
    expect(phoneTabActief('/agents', home)).toBe(false);
    expect(phoneTabActief('/trading', trading)).toBe(true);
    expect(phoneTabActief('/agents', more)).toBe(true);
    expect(phoneTabActief('/trading', more)).toBe(false);
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
