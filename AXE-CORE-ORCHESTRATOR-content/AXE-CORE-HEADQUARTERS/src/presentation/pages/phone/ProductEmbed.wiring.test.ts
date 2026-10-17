import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bron = readFileSync(join(__dirname, 'ProductEmbed.tsx'), 'utf8');

describe('ProductEmbed', () => {
  it('is vol-scherm zonder ‹ More en opent de ingelogde routes in HQ', () => {
    expect(bron).not.toContain('Back to More');
    expect(bron).not.toContain("navigate('/apps')");
    expect(bron).toContain("https://axecompanion.com/chat");
    expect(bron).toContain("https://app.axon-memory.com/");
    expect(bron).not.toContain("https://app.axon-memory.com/home");
    expect(bron).toContain('data-axe-embed-frame');
    expect(bron).toContain('Opening');
    expect(bron).not.toContain('nativeBrowseOpen');
    expect(bron).not.toContain('openAndroidApp');
    expect(bron).not.toContain('isAppInstalled');
    expect(bron).not.toContain('androidAppsBridge');
    expect(bron).not.toContain('androidBrowseBridge');
    expect(bron).not.toMatch(/__AXE_ANDROID__/);
  });
});
