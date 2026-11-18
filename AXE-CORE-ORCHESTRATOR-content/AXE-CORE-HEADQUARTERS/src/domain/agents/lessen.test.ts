import { describe, expect, it } from 'vitest';
import { isCorrectie, lesRegel } from './lessen';

describe('correctie als les (18 nov)', () => {
  it('herkent een blijvende regel', () => {
    for (const t of ['onthoud: geen ID\'s in berichten aan mij', 'voortaan eerst in gewone taal uitleggen', 'doe dat nooit meer zonder te vragen']) {
      expect(isCorrectie(t), t).toBe(true);
    }
  });
  it('een gewone vraag is geen les', () => {
    for (const t of ['wat wacht er op mij?', 'ok alles', 'hoe staat aurubis']) expect(isCorrectie(t), t).toBe(false);
  });
  it('haalt "onthoud:" eraf', () => {
    expect(lesRegel('Onthoud: geen ID\'s in berichten')).toBe("geen ID's in berichten");
  });
});
