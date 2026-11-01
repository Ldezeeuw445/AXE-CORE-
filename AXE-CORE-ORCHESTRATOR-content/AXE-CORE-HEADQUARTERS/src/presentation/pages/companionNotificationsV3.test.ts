import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Companion / Notifications v3', () => {
  it('companion and notifications tagged', () => {
    const emb = readFileSync(resolve(__dirname, 'phone/ProductEmbed.tsx'), 'utf8');
    const tasks = readFileSync(resolve(__dirname, 'phone/PhoneTasks.tsx'), 'utf8');
    expect(emb).toContain('data-axe-companion="v3"');
    expect(emb).toContain('COMPANION_URL');
    expect(tasks).toContain("data-axe-notifications={start === 'alerts' ? 'v3' : undefined}");
  });
});
