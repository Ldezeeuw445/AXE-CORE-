import { describe, expect, it } from 'vitest';
import { isHoofdvenster } from './useWakeWord';

describe('alleen het hoofdvenster luistert naar het wekwoord (17 nov, focus.log Mac mini)', () => {
  const venster = (label?: string) => ({ __TAURI_INTERNALS__: { metadata: { currentWindow: label ? { label } : undefined } } });

  it('de notch en andere losse vensters luisteren niet', () => {
    expect(isHoofdvenster(venster('axe-float-axe'))).toBe(false);
    expect(isHoofdvenster(venster('axe-app-companion'))).toBe(false);
  });

  it('het hoofdvenster en de browser wel', () => {
    expect(isHoofdvenster(venster('main'))).toBe(true);
    expect(isHoofdvenster({})).toBe(true);
  });
});
