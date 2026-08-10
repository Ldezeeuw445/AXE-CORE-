/**
 * The action guard's job is to notice when AXE says it will change something
 * and then doesn't. Its patterns are the whole implementation, and patterns
 * fail quietly — the first version of MUTATION missed the exact sentence that
 * motivated the feature, because Dutch separable verbs put the particle at the
 * end of the clause and the gap was wider than the window allowed.
 *
 * Reading the regex did not catch that. Running it did. So the cases below are
 * phrased the way AXE actually replies, and the two named at the top are the
 * real ones from the day this was reported.
 */
import { describe, it, expect } from 'vitest';
import { promisesUnkeptAction } from './actionIntent';

/** Convenience: the guard only ever matters when no tool ran. */
const fires = (reply: string) => promisesUnkeptAction(reply, false);

describe('promisesUnkeptAction', () => {
  describe('fires on a promise with nothing behind it', () => {
    it.each([
      // The sentence that started this. 38 chars between "haal" and "weg".
      'Ik haal die Smart Home knop even voor je weg.',
      'Ik ga de widget verwijderen uit de sidebar.',
      'Even de composer glow aanpassen, moment.',
      'Ik pas de kleur aan in de CSS.',
      'Ik zet die optie voor je aan.',
      'Ik voeg dat vandaag nog aan de trading tab toe.',
      "I'll remove that button for you.",
      'Let me update the config and push it.',
    ])('%s', (reply) => {
      expect(fires(reply)).toBe(true);
    });
  });

  describe('stays quiet when nothing was promised', () => {
    it.each([
      // Honest refusals must never be flagged as broken promises.
      'Dat kan ik niet, ik heb geen toegang tot je lokale bestanden.',
      'Je moet dat zelf doen, handmatig in de code.',
      "I can't edit files on your machine.",
      // Description, not commitment.
      'De widget staat in RightPanel.tsx en toont je gewoontes.',
      'Ik denk dat de oorzaak een conische gradiënt is.',
      'Hoe wil je dat de knop eruitziet?',
      // Past tense — reporting a change, not promising one.
      'Smart Home is verwijderd uit de sidebar.',
      // "ik ga ervan uit" is an assumption, not an action.
      'Ik ga ervan uit dat je de donkere variant wilt.',
    ])('%s', (reply) => {
      expect(fires(reply)).toBe(false);
    });
  });

  it('never fires when a tool actually ran', () => {
    // The whole point: evidence of a real action outranks any wording.
    expect(promisesUnkeptAction('Ik haal die knop nu weg.', true)).toBe(false);
  });

  it('ignores an empty reply', () => {
    expect(fires('   ')).toBe(false);
  });
});
