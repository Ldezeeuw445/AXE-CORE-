import { describe, expect, it } from 'vitest';
import { followupIsAkkoord, followupIsAfwijzing } from './goedkeuringFollowup';

describe('followupIsAkkoord', () => {
  it('herkent Luka\'s zin uit de NorthSea-popover', () => {
    expect(followupIsAkkoord('what needsmy OK? and you can give it my OK')).toBe(true);
    expect(followupIsAkkoord('you can give it my OK')).toBe(true);
    expect(followupIsAkkoord('give it my okay')).toBe(true);
    expect(followupIsAkkoord('akkoord')).toBe(true);
    expect(followupIsAkkoord('ja')).toBe(true);
    expect(followupIsAkkoord('Approve')).toBe(true);
  });

  it('start geen OK op gewone opvolging', () => {
    expect(followupIsAkkoord('chase the copper deal')).toBe(false);
    expect(followupIsAkkoord('what needs my OK?')).toBe(false);
    expect(followupIsAkkoord('')).toBe(false);
  });
});

describe('followupIsAfwijzing', () => {
  it('herkent een nee', () => {
    expect(followupIsAfwijzing('nee')).toBe(true);
    expect(followupIsAfwijzing('reject this')).toBe(true);
    expect(followupIsAfwijzing('niet doen')).toBe(true);
  });

  it('is geen afwijzing als hij tegelijk OK geeft', () => {
    expect(followupIsAfwijzing('you can give it my OK')).toBe(false);
  });
});
