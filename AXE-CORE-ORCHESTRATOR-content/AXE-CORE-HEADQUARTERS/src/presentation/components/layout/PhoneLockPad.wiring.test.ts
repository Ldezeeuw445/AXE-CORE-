import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('lock-pad deelt geen Home-schil', () => {
  it('verbergt bel, onderbalk, composer en laden op /lock én /lock/pin', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(shell).toContain('isLockPad(location.pathname)');
    expect(shell).toContain('dataset.axeLockPad');
    expect(shell).toContain('axe-lock-pad');
    expect(shell).toContain('mobileNav && !opSlot');
    expect(shell).not.toContain("location.pathname !== '/lock' && <PhoneVoet");
    expect(shell).toContain('<MobieleTabSchil>');
    expect(shell).toContain('{!opSlot && <GlobalCommandPalette />}');
  });

  it('telefoon-PIN is een cijfer-keypad zonder particle-canvas', () => {
    const pin = bron('presentation/pages/PhonePinScreen.tsx');
    expect(pin).toContain('data-axe-lock-pin');
    expect(pin).toContain('data-axe-pin-soort="numeric"');
    expect(pin).toContain('data-axe-pin-pad');
    expect(pin).toContain('data-axe-pin-overslaan');
    expect(pin).toContain('Enter PIN');
    expect(pin).not.toContain('ParticleGestureField');
    expect(pin).not.toContain('<canvas');
    expect(pin).not.toContain('Draw your code');
    expect(pin).toContain("fout !== OPSLAG_DICHT");
  });

  it('Android-gate toont PIN alleen als telefoonPinNodig, anders Home', () => {
    const gate = bron('presentation/hooks/useAndroidLock.tsx');
    expect(gate).toContain('telefoonPinNodig');
    expect(gate).toContain('ontgrendel()');
    expect(gate).toContain('Navigate to="/lock/pin"');
    expect(gate).toContain('androidPinPad');
    expect(gate).not.toContain('ParticlePinScreen');
  });
});
