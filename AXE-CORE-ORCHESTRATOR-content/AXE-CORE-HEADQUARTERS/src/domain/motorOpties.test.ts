import { describe, expect, it } from 'vitest';
import { motorOpties } from './motorOpties';

const acc = {
  claude: { ingelogd: true, account: 'a@gmail.com' },
  claude2: { ingelogd: true, account: 'A@gmail.com' },
  claude3: { ingelogd: false },
  codex: { ingelogd: true, account: 'b@x.com' },
  codex2: { ingelogd: true, account: 'c@x.com' },
  cursor: { ingelogd: null },
};

describe('motorOpties', () => {
  it('geen dubbel account, geen niet-ingelogde, sleutels blijft', () => {
    expect(motorOpties(['claude', 'claude2', 'claude3', 'codex', 'codex2', 'cursor', 'sleutels'], acc, 'sleutels'))
      .toEqual(['claude', 'codex', 'codex2', 'cursor', 'sleutels']);
  });
  it('de huidige keuze blijft zichtbaar, ook als hij niet klopt', () => {
    expect(motorOpties(['claude', 'claude3', 'sleutels'], acc, 'claude3')).toEqual(['claude', 'claude3', 'sleutels']);
    expect(motorOpties(['claude', 'claude2', 'sleutels'], acc, 'claude2')).toEqual(['claude', 'claude2', 'sleutels']);
  });
});

import { zonderFalende } from './motorOpties';

describe('zonderFalende', () => {
  const keuzes = [{ provider: 'groq', model: 'a' }, { provider: 'openrouter', model: 'b' }, { provider: 'openai', model: 'c' }];
  const v = { groq: { lastTest: 'ok' }, openrouter: { lastTest: 'fail' } };
  it('haalt falende providers weg, behalve de huidige keuze', () => {
    expect(zonderFalende(keuzes, v).map((k) => k.provider)).toEqual(['groq', 'openai']);
    expect(zonderFalende(keuzes, v, 'openrouter:b').map((k) => k.provider)).toEqual(['groq', 'openrouter', 'openai']);
  });
});
