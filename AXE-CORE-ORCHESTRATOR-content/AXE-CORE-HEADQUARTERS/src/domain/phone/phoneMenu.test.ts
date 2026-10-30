import { describe, expect, it } from 'vitest';
import {
  PHONE_MENU, phoneMenuActief, phoneHeeftAppBar, phoneAppBarTitel,
} from './phoneMenu';

describe('phoneMenu', () => {
  it('heeft precies de zes primaire deuren (fase 1)', () => {
    expect(PHONE_MENU.map((i) => i.label)).toEqual([
      'Home', 'Managers', 'NorthSea', 'Trading', 'Bouwen', 'Systeem',
    ]);
    expect(PHONE_MENU.map((i) => i.path)).not.toContain('/apps');
    expect(PHONE_MENU.map((i) => i.path)).not.toContain('/settings');
    expect(PHONE_MENU.map((i) => i.path)).not.toContain('/ai-core');
  });

  it('markeert Home op /mobile en Managers op /managers', () => {
    expect(phoneMenuActief('/mobile', '/mobile')).toBe(true);
    expect(phoneMenuActief('/', '/mobile')).toBe(true);
    expect(phoneMenuActief('/managers', '/managers')).toBe(true);
    expect(phoneMenuActief('/trading', '/mobile')).toBe(false);
  });

  it('geeft elke tab een app-balk, behalve Home en lock', () => {
    expect(phoneHeeftAppBar('/mobile')).toBe(false);
    expect(phoneHeeftAppBar('/')).toBe(false);
    expect(phoneHeeftAppBar('/lock')).toBe(false);
    expect(phoneHeeftAppBar('/managers')).toBe(true);
    expect(phoneHeeftAppBar('/systeem')).toBe(true);
    expect(phoneHeeftAppBar('/trading')).toBe(true);
    expect(phoneHeeftAppBar('/bouwen')).toBe(true);
    expect(phoneHeeftAppBar('/northsea')).toBe(true);
  });

  it('zet Demo only en Never send als balk-actie', () => {
    expect(phoneAppBarTitel('/trading')).toEqual({ title: 'Trading', extra: 'Demo only' });
    expect(phoneAppBarTitel('/northsea')).toEqual({ title: 'NorthSea', extra: 'Never send' });
    expect(phoneAppBarTitel('/bouwen').title).toBe('Bouwen');
  });
});
