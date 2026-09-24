import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('whisper send-guard aangesloten', () => {
  it('main.tsx zet de guard ná de andere sendMessage-wrappers', () => {
    const bron = readFileSync(join(__dirname, 'main.tsx'), 'utf8');
    const guard = bron.indexOf('installWhisperVoiceSendGuard()');
    const sphere = bron.indexOf('installSpherePresent()');
    expect(guard).toBeGreaterThan(0);
    expect(sphere).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(sphere);
  });
});
