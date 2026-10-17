import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('gedeelde A17-schil', () => {
  it('hangt bel en app-balk aan de telefoon-schil, zonder onderbalk', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    const home = bron('presentation/pages/Home.tsx');
    expect(shell).toContain('<PhoneBel />');
    expect(shell).toContain('<PhoneAppBar');
    expect(shell).not.toContain('<PhoneVoet');
    expect(shell).toContain('phoneZonderComposer');
    expect(shell).toContain('mobileNav && !opSlot');
    expect(shell).toContain('<MobieleTabSchil>');
    expect(home).not.toContain('PhoneVoet');
    expect(home).toContain('!isMobile && <HomeLiveDashboard');
  });

  it('gebruikt één Approve/Decline-component op desktop, bel en telefoon', () => {
    const knoppen = bron('presentation/components/axe-core/GoedkeuringActie.tsx');
    const voet = bron('presentation/components/layout/PhoneChrome.tsx');
    const bel = bron('presentation/components/axe-core/AwarenessCenter.tsx');
    const pwa = bron('presentation/pages/MobileSystem.tsx');
    expect(knoppen).toContain('Approve');
    expect(knoppen).toContain('Decline');
    expect(knoppen).toContain('PHONE_TIKMAAT');
    expect(knoppen).toContain('touch');
    expect(voet).toContain('GoedkeuringActie');
    expect(voet).toContain('touch');
    expect(voet).toContain('PHONE_TABS');
    expect(bel).toContain('GoedkeuringActie');
    expect(pwa).toContain('GoedkeuringActie');
    expect(pwa).not.toMatch(/<button type="button" onClick=\{\(\) => beslissen\(true\)\}/);
  });

  it('zet de bel rechtsboven naast licht/donker', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(shell).toContain('axe-mobile-look-toggle');
    expect(shell).toContain('<PhoneBel />');
    expect(shell).toContain('<LookToggle />');
    expect(bron('presentation/components/layout/PhoneChrome.tsx')).toContain('Notifications, ${wacht} waiting');
    expect(bron('presentation/components/layout/PhoneChrome.tsx')).toContain('PhoneMeldingen');
    expect(bron('presentation/components/layout/PhoneChrome.tsx')).not.toContain('AwarenessCenter');
  });
});
