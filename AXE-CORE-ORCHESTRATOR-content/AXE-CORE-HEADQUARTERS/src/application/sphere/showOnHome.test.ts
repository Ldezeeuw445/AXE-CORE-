import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/gateways/tavilyService', () => ({
  tavilySearch: vi.fn(async () => [{
    title: 'Rente omlaag',
    url: 'https://nos.nl/rente',
    content: 'De ECB verlaagt de rente.',
    score: 0.9,
  }]),
}));

import { directFromChat } from '@/application/sphere/sphereDirector';
import { subjectOfShow } from '@/application/sphere/projectionResolvers/contentResolver';

describe('iets laten zien op home', () => {
  it('pakt het onderwerp uit de zin', () => {
    expect(subjectOfShow('laat het nieuws over de rente zien')).toBe('nieuws over de rente');
    expect(subjectOfShow('show me the ASML article')).toBe('ASML article');
  });

  it('zet een nieuwsverzoek op de bol als document, niet als kaart', async () => {
    const proj = await directFromChat({ text: 'laat het nieuws over de rente zien' });
    expect(proj?.mode).toBe('document');
    expect(proj?.text).toContain('ECB');
    expect(proj?.text).toContain('https://nos.nl/rente');
  });

  it('laat een stad een kaart', async () => {
    const proj = await directFromChat({ text: 'laat New York zien' });
    expect(proj?.mode).toBe('map');
    expect(proj?.title).toBe('New York');
  });
});

/* 9 okt: AXE zet zelf dingen op Home -- een voorbeeld dat hij schreef, een
   samenvatting van het gesprek, of iets dat hij nog moet opzoeken. */
describe('AXE laat zelf iets zien', () => {
  it('een ```html-voorbeeld staat live op Home', async () => {
    const { directFromAssistantMessage } = await import('@/application/sphere/sphereDirector');
    const proj = directFromAssistantMessage('Zo zou het eruit zien:\n```html\n<div style="color:red">Pricing card met prijs</div>\n```\n[PROJECT: {"mode":"html","title":"Pricing card"}]');
    expect(proj?.mode).toBe('html');
    expect(proj?.title).toBe('Pricing card');
    expect(proj?.text).toContain('Pricing card met prijs');
  });

  it('een samenvatting als document', async () => {
    const { directFromAssistantMessage } = await import('@/application/sphere/sphereDirector');
    const proj = directFromAssistantMessage('Staat op Home. [PROJECT: {"mode":"document","title":"Plan","text":"1. eerst\\n2. dan"}]');
    expect(proj).toMatchObject({ mode: 'document', title: 'Plan' });
    expect(proj?.text).toContain('2. dan');
  });

  it('een marker met query wordt eerst opgezocht', async () => {
    const proj = await (await import('@/application/sphere/sphereDirector'))
      .directFromAssistantMessageAsync('Kijk. [PROJECT: {"mode":"web","query":"rente ECB"}]');
    expect(proj?.mode).toBe('document');
    expect(proj?.text).toContain('ECB');
  });
});
