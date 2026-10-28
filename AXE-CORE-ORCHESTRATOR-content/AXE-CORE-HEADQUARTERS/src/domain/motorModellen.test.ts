import { describe, expect, it } from 'vitest';
import { kiesModel, modelVoor, normaliseerModellen } from './motorModellen';

describe('normaliseerModellen', () => {
  it('houdt alleen echte motoren met een echte waarde', () => {
    expect(normaliseerModellen({ claude: 'opus', codex2: ' gpt-5-codex ', onzin: 'x', cursor: '   ' }))
      .toEqual({ claude: 'opus', codex2: 'gpt-5-codex' });
  });

  it('overleeft kapotte opslag', () => {
    expect(normaliseerModellen(null)).toEqual({});
    expect(normaliseerModellen('kapot')).toEqual({});
  });
});

describe('modelVoor', () => {
  it('leeg betekent: de CLI kiest zelf, ook voor Codex; astra wordt niet gepind', () => {
    expect(modelVoor({}, 'claude')).toBeUndefined();
    expect(modelVoor({ claude: 'opus' }, 'claude')).toBe('opus');
    expect(modelVoor({}, 'codex')).toBeUndefined();
    expect(modelVoor({ codex: 'gpt-6-astra' }, 'codex')).toBeUndefined();
    expect(modelVoor({ codex: 'o3' }, 'codex')).toBe('o3');
  });

  it('API-sleutels hebben deze keuze niet', () => {
    expect(modelVoor({ claude: 'opus' }, 'sleutels')).toBeUndefined();
  });
});

describe('kiesModel', () => {
  it('zet en wist, zodat leegmaken de standaard teruggeeft', () => {
    const een = kiesModel({}, 'codex', 'o3');
    expect(een).toEqual({ codex: 'o3' });
    expect(kiesModel(een, 'codex', '  ')).toEqual({});
  });
});
