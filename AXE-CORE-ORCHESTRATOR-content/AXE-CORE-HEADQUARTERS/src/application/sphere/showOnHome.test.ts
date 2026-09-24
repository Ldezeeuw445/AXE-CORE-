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
