import { afterEach, describe, expect, it, vi } from 'vitest';
import { mobileViewportHeight } from './useMobileViewportHeight';

afterEach(() => vi.unstubAllGlobals());

function phone({ standalone = true, landscape = false, embedded = false, userAgent = 'iPhone' } = {}) {
  const top = {};
  vi.stubGlobal('window', {
    navigator: { standalone, userAgent },
    self: embedded ? {} : top, top,
    innerHeight: 790,
    screen: { width: 393, height: 852 },
    matchMedia: (query: string) => ({ matches: query.includes('orientation') ? landscape : standalone }),
  });
}

describe('mobiele plaat volgt het volledige PWA-scherm', () => {
  it('gebruikt ook bij een 62px verkorte viewport de volledige iPhone-hoogte', () => {
    phone();
    expect(mobileViewportHeight()).toBe('852px');
  });
  it('volgt het scherm bij draaien', () => {
    phone({ landscape: true });
    expect(mobileViewportHeight()).toBe('393px');
  });
  it.each([
    { standalone: false },
    { embedded: true },
    { userAgent: 'Macintosh' },
    { userAgent: 'Android' },
  ])('houdt de normale viewport buiten de iOS-PWA: %j', (options) => {
    phone(options);
    expect(mobileViewportHeight()).toBe('100dvh');
  });
});
