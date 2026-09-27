import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('mobile PWA entry', () => {
  it('redirects phone-sized root launches to the canonical mobile Home', () => {
    const app = read('src/app/App.tsx');
    expect(app).toContain('function HomeEntry()');
    expect(app).toContain('if (isMobile) return <Navigate to="/mobile" replace />;');
    expect(app).toContain('<Route index element={<HomeEntry />} />');
  });

  it('keeps the PWA install identity stable and starts on mobile', () => {
    const manifest = JSON.parse(read('public/manifest.json')) as {
      id?: string;
      scope?: string;
      start_url?: string;
    };
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/#/mobile');
  });
});
