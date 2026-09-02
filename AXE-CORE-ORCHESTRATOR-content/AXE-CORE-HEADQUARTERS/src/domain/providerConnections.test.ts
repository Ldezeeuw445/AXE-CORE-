import { describe, it, expect } from 'vitest';
import { mergeConnections } from './providerConnections';

describe('mergeConnections', () => {
  it('houdt de sleutel van de cloud als dit apparaat er niets van weet', () => {
    // Dit is de storing van 2 sep 2026: de gehoste app kende de sleutels niet
    // en schreef haar lege beeld over de cloud heen.
    const cloud = {
      openai: { key: 'sk-echt', model: 'gpt-4o-mini' },
      groq:   { key: 'gsk-echt' },
    };
    const local = { openai: { lastTest: 'testing' as const } };

    const out = mergeConnections(cloud, local);

    expect(out.openai.key).toBe('sk-echt');
    expect(out.groq.key).toBe('gsk-echt');
  });

  it('laat een bewust leeggemaakt veld wel doorkomen', () => {
    // Een lege string is een keuze, geen onwetendheid. Zonder dit onderscheid
    // kun je een sleutel nooit meer verwijderen.
    const cloud = { openai: { key: 'sk-oud' } };
    const local = { openai: { key: '' } };

    expect(mergeConnections(cloud, local).openai.key).toBe('');
  });

  it('laat een nieuwe sleutel de oude vervangen', () => {
    const cloud = { openai: { key: 'sk-oud' } };
    const local = { openai: { key: 'sk-nieuw' } };

    expect(mergeConnections(cloud, local).openai.key).toBe('sk-nieuw');
  });

  it('bewaart velden die dit apparaat wel bijwerkt naast de beschermde sleutel', () => {
    const cloud = { openai: { key: 'sk-echt', model: 'gpt-4o-mini' } };
    const local = { openai: { model: 'gpt-5', lastTest: 'ok' as const } };

    const out = mergeConnections(cloud, local);

    expect(out.openai).toEqual({ key: 'sk-echt', model: 'gpt-5', lastTest: 'ok' });
  });

  it('neemt providers over die alleen lokaal bestaan', () => {
    const out = mergeConnections({ openai: { key: 'a' } }, { groq: { key: 'b' } });

    expect(Object.keys(out).sort()).toEqual(['groq', 'openai']);
  });

  it('beschermt niets als de cloud zelf leeg is', () => {
    // Eerste keer opslaan op een verse database: niets te verliezen, alles
    // van dit apparaat hoort erin te komen.
    const out = mergeConnections({}, { openai: { key: 'sk-eerste' } });

    expect(out).toEqual({ openai: { key: 'sk-eerste' } });
  });

  it('overschrijft een lege cloudsleutel wel', () => {
    const out = mergeConnections({ openai: { key: '' } }, { openai: { model: 'gpt-5' } });

    expect(out.openai.key).toBe('');
    expect(out.openai.model).toBe('gpt-5');
  });
});
