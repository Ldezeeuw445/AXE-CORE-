import { describe, it, expect } from 'vitest';
import { sanitizeLlmText } from './sanitizeLlmText';
import { SOCIAL_LEAK_FALLBACK } from '@/domain/tools/toolLeak';

describe('sanitizeLlmText', () => {
  it('stript safety-labels', () => {
    expect(sanitizeLlmText('User Safety: safe\nHey Luka.')).toBe('Hey Luka.');
  });

  it('vervangt een tool-marker-lek door een gewone begroeting', () => {
    const leak =
      'Ik kan hier niet mee werken omdat er geen tool-marker aanwezig is; ik moet altijd de juiste marker gebruiken (zoals [SEARCH:]).';
    expect(sanitizeLlmText(leak)).toBe(SOCIAL_LEAK_FALLBACK);
  });
});
