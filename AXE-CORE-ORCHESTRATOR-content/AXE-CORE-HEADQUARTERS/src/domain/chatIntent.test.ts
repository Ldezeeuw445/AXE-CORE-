import { describe, it, expect } from 'vitest';
import { classifyChatIntent, isSocialChatTurn } from './chatIntent';

describe('isSocialChatTurn', () => {
  it.each(['hey axe', 'heyaxe', 'hey axe!', 'hi axe', 'hoi', 'hallo', 'ben je daar', "what's up"])(
    'ziet "%s" als sociale beurt',
    (text) => {
      expect(isSocialChatTurn(text)).toBe(true);
      expect(classifyChatIntent(text)).toBe('talk');
    },
  );

  it.each([
    'open Safari',
    'klik daar',
    'type hello world',
    'scroll omlaag',
    'ga naar github.com',
    'hey axe, start Finder',
    'zet Spotify open',
  ])('stuurt gesproken computeropdracht "%s" naar ACT', (text) => {
    expect(classifyChatIntent(text)).toBe('act');
    expect(isSocialChatTurn(text)).toBe(false);
  });

  it('maakt een gesprek óver een actie niet automatisch tot ACT', () => {
    expect(classifyChatIntent('wat vind je van Safari openen?')).toBe('talk');
  });

  it('laat een echte vraag of actie met rust', () => {
    expect(isSocialChatTurn('hey axe, fix the login bug')).toBe(false);
    expect(isSocialChatTurn('hey axe, wat is de bitcoin koers')).toBe(false);
    expect(isSocialChatTurn('zoek de bitcoin koers')).toBe(false);
    expect(isSocialChatTurn('wat is de status van de VPS?')).toBe(false);
  });
});
