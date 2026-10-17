import { describe, expect, it } from 'vitest';
import {
  PHONE_MENU, phoneMenuActief, phoneHeeftAppBar, phoneAppBarTitel,
} from './phoneMenu';

describe('phoneMenu', () => {
  it('heeft precies de negen telefoon-apps, met Developer niet als Code Editor', () => {
    expect(PHONE_MENU.map((i) => i.label)).toEqual([
      'Home', 'Trading', 'NorthSea Desk', 'Browser', 'AXE Companion',
      'AXON Memory', 'AXE Developer', 'Tasks', 'Systems',
    ]);
    expect(PHONE_MENU.map((i) => i.path)).not.toContain('/apps');
    expect(PHONE_MENU.map((i) => i.path)).not.toContain('/settings');
    expect(PHONE_MENU.map((i) => i.path)).not.toContain('/ai-core');
  });

  it('markeert Home op /mobile en AXON op /memory', () => {
    expect(phoneMenuActief('/mobile', '/mobile')).toBe(true);
    expect(phoneMenuActief('/', '/mobile')).toBe(true);
    expect(phoneMenuActief('/memory/explore', '/memory')).toBe(true);
    expect(phoneMenuActief('/trading', '/mobile')).toBe(false);
  });

  it('geeft elke tab een app-balk, behalve Home en lock', () => {
    expect(phoneHeeftAppBar('/mobile')).toBe(false);
    expect(phoneHeeftAppBar('/')).toBe(false);
    expect(phoneHeeftAppBar('/lock')).toBe(false);
    expect(phoneHeeftAppBar('/companion')).toBe(true);
    expect(phoneHeeftAppBar('/memory')).toBe(true);
    expect(phoneHeeftAppBar('/trading')).toBe(true);
    expect(phoneHeeftAppBar('/browser')).toBe(true);
    expect(phoneHeeftAppBar('/code-editor')).toBe(true);
    expect(phoneHeeftAppBar('/tasks')).toBe(true);
    expect(phoneHeeftAppBar('/infrastructure')).toBe(true);
  });

  it('zet Read-only en Never send als balk-actie, niet als tweede titel', () => {
    expect(phoneAppBarTitel('/trading')).toEqual({ title: 'Trading', extra: 'Read-only' });
    expect(phoneAppBarTitel('/maps-3d')).toEqual({ title: 'NorthSea', extra: 'Never send' });
    expect(phoneAppBarTitel('/code-editor').title).toBe('AXE Developer');
  });
});
