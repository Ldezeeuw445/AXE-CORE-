import { describe, expect, it } from 'vitest';
import { lockMateriaal } from '@/presentation/components/android/lockMateriaal';

describe('lock-materiaal', () => {
  it('zwart is matzwart frost, licht is grijs frost zonder wit vlak', () => {
    const zwart = lockMateriaal('black');
    const licht = lockMateriaal('glass');
    expect(String(zwart.kaart.background)).toMatch(/8, 9, 12/);
    expect(String(licht.kaart.background)).toMatch(/96, 102, 112/);
    expect(String(licht.kaart.background)).not.toMatch(/#fff|#ffffff|255,\s*255,\s*255,\s*1/);
  });
});
