import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('geen tweede particle-bol op de telefoon', () => {
  it('geen route monteert ParticlePinScreen of ParticleGestureField', () => {
    const app = bron('app/App.tsx');
    expect(app).not.toContain('ParticlePinScreen');
    expect(app).not.toContain('ParticleGestureField');
    expect(bron('presentation/pages/PhonePinScreen.tsx')).not.toContain('ParticleGestureField');
    expect(bron('presentation/hooks/useAndroidLock.tsx')).not.toContain('ParticleGestureField');
  });

  it('TelefoonSphere is de enige bol op /mobile; AxeCoreSphere alleen als fallback', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    expect(mobile).toContain('<TelefoonSphere />');
    expect(mobile).not.toContain('<AxeCoreSphere');
    expect(mobile).not.toContain('ParticleGestureField');
    const telefoon = bron('presentation/components/axe-core/sphere/TelefoonSphere.tsx');
    expect(telefoon).toContain('data-axe-bol="ja"');
    expect(telefoon).toContain('if (!webgl) return <AxeCoreSphere telefoon />');
  });
});
