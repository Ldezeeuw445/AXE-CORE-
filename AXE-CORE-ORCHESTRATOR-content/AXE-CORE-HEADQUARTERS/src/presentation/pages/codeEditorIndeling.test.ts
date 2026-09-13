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

  it('toont op de code-tab alleen de kop: CODE AGENT met motor en repo, geen gesprek', () => {
    const chat = lees('../components/layout/PlaatChat.tsx');
    expect(chat).toMatch(/const kopAlleen = opEditor \|\| chatCollapsed/);
    expect(chat).toMatch(/CODE AGENT/);
    expect(chat).toMatch(/snelactieLijst=\{opEditor \? codeKop\?\.snelacties : undefined\}/);
  });

  it('heeft geen topbalk meer: weergaven links en motoren rechts naast de composer', () => {
    const pagina = lees('./CodeEditorPage.tsx');
    expect(pagina).toMatch(/<PlaatSlot slot="links">\s*<IcoonZuil items=\{weergaveItems\}/);
    expect(pagina).toMatch(/<PlaatSlot slot="rechts">\s*<IcoonZuil items=\{motorItems\}/);
    // De balk bestaat alleen nog op mobiel, voor de bestanden-lade.
    expect(pagina).toMatch(/\{isMobile && \(\s*<div className="axe-studio-balk">/);
  });

  it('laat het Canvas de toestellen op het raster zetten', () => {
    expect(lees('./CodeEditorPage.tsx')).toMatch(/layout="raster"/);
  });
});
