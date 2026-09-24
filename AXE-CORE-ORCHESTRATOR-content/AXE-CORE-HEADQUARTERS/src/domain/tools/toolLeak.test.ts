import { describe, it, expect } from 'vitest';
import {
  looksLikeToolInstructionLeak,
  stripToolInstructionLeak,
  zichtbareAxeAntwoord,
  SOCIAL_LEAK_FALLBACK,
} from './toolLeak';

const SCREENSHOT_LEAK =
  'Ik kan hier niet mee werken omdat er geen tool-marker aanwezig is; ik moet altijd de juiste marker gebruiken (zoals [SEARCH:]), anders zie ik niet dat een actie uitgevoerd wordt en krijg ik niets van de tool terug.';

describe('stripToolInstructionLeak — gordel-en-bretels op bekende lekzinnen', () => {
  it('vervangt de screenshot-lekzin door een gewone begroeting', () => {
    expect(zichtbareAxeAntwoord(SCREENSHOT_LEAK)).toBe(SOCIAL_LEAK_FALLBACK);
  });

  it('herkent de screenshot-zin als lek, ook nadat de marker is weggestript', () => {
    const strippedParens =
      'Ik kan hier niet mee werken omdat er geen tool-marker aanwezig is; ik moet altijd de juiste marker gebruiken (zoals ), anders zie ik niet dat een actie uitgevoerd wordt en krijg ik niets van de tool terug.';
    expect(looksLikeToolInstructionLeak(strippedParens)).toBe(true);
    expect(zichtbareAxeAntwoord(strippedParens)).toBe(SOCIAL_LEAK_FALLBACK);
  });

  it('laat een gewone begroeting met rust', () => {
    const hello = "Hey Luka. I'm here — what's next?";
    expect(zichtbareAxeAntwoord(hello)).toBe(hello);
    expect(looksLikeToolInstructionLeak(hello)).toBe(false);
  });

  it('laat een inhoudelijk antwoord over zoeken met rust', () => {
    const reply = 'Bitcoin is around 64k. Want me to pull the live print?';
    expect(zichtbareAxeAntwoord(reply)).toBe(reply);
  });

  it('stript een voorbeeld-marker uit een verder bruikbare zin', () => {
    const mixed =
      'Klaar. Ik heb het nagekeken. [SEARCH: "dummy"] Bitcoin staat op 64k.';
    const out = zichtbareAxeAntwoord(mixed);
    expect(out).not.toMatch(/\[SEARCH:/);
    expect(out).toMatch(/Bitcoin/);
  });

  it('laat een leeg antwoord leeg — de cascade moet door kunnen', () => {
    expect(zichtbareAxeAntwoord('')).toBe('');
    expect(zichtbareAxeAntwoord('   ')).toBe('');
  });
});
