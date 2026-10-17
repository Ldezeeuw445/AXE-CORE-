import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('PhoneMeldingen', () => {
  it('hangt aan de bel en leest dezelfde core_notifications als de desktop-bel', () => {
    const bel = bron('presentation/components/layout/PhoneChrome.tsx');
    const blad = bron('presentation/components/layout/PhoneMeldingen.tsx');
    expect(bel).toContain('<PhoneMeldingen');
    expect(blad).toContain('data-axe-phone-meldingen');
    expect(blad).toContain('useNotifications');
    expect(blad).toContain('GoedkeuringActie');
    expect(blad).toContain('No notifications yet');
  });
});
