import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Mobile / Device / Lock / Lock-pin v3', () => {
  it('tagged', () => {
    expect(readFileSync(resolve(__dirname, 'MobileSystem.tsx'), 'utf8')).toContain('data-axe-mobile="v3"');
    expect(readFileSync(resolve(__dirname, 'DeviceManager.tsx'), 'utf8')).toContain('data-axe-device="v3"');
    expect(readFileSync(resolve(__dirname, 'LockScreen.tsx'), 'utf8')).toContain('data-axe-lock="v3"');
    expect(readFileSync(resolve(__dirname, 'PhonePinScreen.tsx'), 'utf8')).toContain('data-axe-lock-pin-v3="v3"');
    expect(readFileSync(resolve(__dirname, 'PhonePinScreen.tsx'), 'utf8')).toContain('data-axe-lock-pin');
  });
});
