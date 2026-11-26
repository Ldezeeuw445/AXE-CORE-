import { describe, expect, it } from 'vitest';
import { bureauBlok, bureauOpdracht, leesLink, linkId, lijstAntwoord, normUrl, perMap, type BureauLink } from './bureau';

const L = (p: Partial<BureauLink>): BureauLink => ({ id: 'x', url: 'https://a.com', titel: 'a.com', map: 'Tools', waarom: '', op: 1, ...p });

describe('Bureau', () => {
  it('maakt van een adres een nette url', () => {
    expect(normUrl('linear.app/axe')).toBe('https://linear.app/axe');
    expect(normUrl('https://x.com/).')).toBe('https://x.com');
    expect(normUrl('geen adres')).toBeNull();
    expect(normUrl('localhost')).toBeNull();
    expect(linkId('https://X.com')).toBe(linkId('https://x.com'));
  });

  it('herkent bewaren met map en waarom', () => {
    expect(bureauOpdracht('bewaar https://resend.com in Tools: mail versturen voor NorthSea'))
      .toEqual({ soort: 'bewaar', url: 'https://resend.com', map: 'Tools', waarom: 'mail versturen voor NorthSea' });
    expect(bureauOpdracht('zet platts.com op mijn bureau: olieprijzen'))
      .toEqual({ soort: 'bewaar', url: 'https://platts.com', map: 'Algemeen', waarom: 'olieprijzen' });
    expect(bureauOpdracht('save shapeup.com to methods')).toMatchObject({ map: 'Methods', waarom: '' });
    expect(bureauOpdracht('wat staat er op mijn bureau?')).toEqual({ soort: 'lijst' });
    expect(bureauOpdracht('bewaar dit even voor later')).toBeNull();
    expect(bureauOpdracht('zet de lamp aan')).toBeNull();
  });

  it('groepeert per map, verbergt gearchiveerd en zoekt', () => {
    const ls = [L({ id: '1', map: 'Tools', op: 1 }), L({ id: '2', map: 'Sites', url: 'https://b.com', op: 2 }), L({ id: '3', map: 'Tools', op: 3 }), L({ id: '4', map: 'Tools', weg: true })];
    const g = perMap(ls);
    expect(g.map((x) => x.map)).toEqual(['Sites', 'Tools']);
    expect(g[1].links.map((l) => l.id)).toEqual(['3', '1']);
    expect(perMap(ls, 'b.com').map((x) => x.map)).toEqual(['Sites']);
  });

  it('leest rijen veilig en zet het bureau alleen in de prompt als erom gevraagd', () => {
    expect(leesLink('link:abc', JSON.stringify({ url: 'https://a.com', map: 'tools', waarom: 'w', op: 5 })))
      .toEqual({ id: 'abc', url: 'https://a.com', titel: 'a.com', map: 'Tools', waarom: 'w', op: 5 });
    expect(leesLink('link:abc', 'kapot')).toBeNull();
    expect(leesLink('ander:abc', '{}')).toBeNull();
    expect(bureauBlok([L({ waarom: 'snel' })], 'hoe gaat het')).toBe('');
    expect(bureauBlok([L({ waarom: 'snel' })], 'welke tools staan op mijn bureau?')).toContain('-- snel');
    expect(lijstAntwoord([])).toContain('leeg');
  });
});
