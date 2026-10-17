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

  it('toont geen rode Secure-storage-fout op het particle-slot', () => {
    const pin = bron('presentation/pages/ParticlePinScreen.tsx');
    expect(pin).toContain("setModus('setup')");
    expect(pin).toContain('fout !== OPSLAG_DICHT');
    expect(pin).not.toContain("setModus('dicht')");
    expect(pin).toContain('data-axe-lock-pin');
  });
});
