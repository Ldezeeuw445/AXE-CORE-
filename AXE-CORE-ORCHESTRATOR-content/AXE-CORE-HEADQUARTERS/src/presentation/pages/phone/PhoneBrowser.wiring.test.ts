import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bron = readFileSync(join(__dirname, 'PhoneBrowser.tsx'), 'utf8');

describe('PhoneBrowser', () => {
  it('praat niet met de Mac-mini-proxy', () => {
    expect(bron).not.toContain('LiveBrowserView');
    expect(bron).not.toContain("from '@/presentation/components/browser/WebView'");
    expect(bron).toContain('nativeBrowseOpen');
    expect(bron).toContain('nativeBrowseReload');
    expect(bron).toContain('data-axe-phone-webview');
    expect(bron).toContain('data-axe-safari-voet');
    expect(bron).toContain('onTouchEnd');
  });
});
