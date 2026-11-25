import { describe, it, expect } from 'vitest';
import { motorNaam } from './motorNaam';

describe('motorNaam', () => {
  it('noemt het account in plaats van een volgnummer', () => {
    expect(motorNaam('Claude 2', { account: 'luka@axe.nl', ingelogd: true })).toBe('Claude · luka@axe.nl');
    expect(motorNaam('Codex 3', { account: 'a@b.nl' })).toBe('Codex · a@b.nl');
  });
  it('zegt het als er niet is ingelogd, met de vaste naam erbij zodat je weet welke', () => {
    expect(motorNaam('Claude 3', { account: null, ingelogd: false })).toBe('Claude 3 (not logged in)');
    expect(motorNaam('Claude subscription', { account: 'support@axeheadquarters.com', ingelogd: false }))
      .toBe('Claude subscription (not logged in)');
    expect(motorNaam('Claude subscription', { ingelogd: false, nietGebruikt: true }))
      .toBe('Claude subscription (not used)');
  });
  it('houdt de vaste naam als er niets bekend is', () => {
    expect(motorNaam('Cursor')).toBe('Cursor');
    expect(motorNaam('Cursor', { account: null, ingelogd: null })).toBe('Cursor');
  });

  it('zegt "verify account" als de login lukte maar de aanbieder verificatie wil', () => {
    expect(motorNaam('Google Antigravity', { ingelogd: false, moetVerifieren: true, account: 'x@gmail.com' }))
      .toBe('Google Antigravity · x@gmail.com (verify account)');
    expect(motorNaam('Google Antigravity', { ingelogd: false, moetVerifieren: true })).toBe('Google Antigravity (verify account)');
  });
});
