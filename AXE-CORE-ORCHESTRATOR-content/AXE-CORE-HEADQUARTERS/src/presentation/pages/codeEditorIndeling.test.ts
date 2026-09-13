import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lees = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('de indeling van de Code Editor', () => {
  it('gebruikt geen <aside>, want axe-look.css maakt van elke aside een verborgen zijlade', () => {
    // Gemeten 13 september: de bestandskolom kreeg position: fixed en
    // translateX(-420px), viel uit het rooster, de editor schoof in het
    // 220px-vak en rechts bleef een lege kolom van 420px over.
    expect(lees('./CodeEditorPage.tsx')).not.toMatch(/<aside[\s>]/);
    expect(lees('../../design/axe-look.css')).toMatch(/\.axe-shell aside \{[^}]*translateX/);
  });

  it('heeft binnen de editorkaart geen tweede plaat meer', () => {
    expect(lees('./CodeEditorPage.tsx')).not.toMatch(/axe-codeplaat/);
  });

  it('toont op de code-tab geen chatplaat, maar houdt PlaatChat gemount voor handleSend', () => {
    const chat = lees('../components/layout/PlaatChat.tsx');
    expect(chat).toMatch(/const opEditor = location\.pathname\.includes\('code-editor'\)/);
    expect(chat).toMatch(/style=\{opEditor \? \{ display: 'none' \} : undefined\}/);
  });
});
