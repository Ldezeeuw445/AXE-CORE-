import { describe, it, expect } from 'vitest';
import { TAB_STIJL, TAB_TERUGVAL, stijlVan } from './tabStijl';
import { accentAfstand } from '@/domain/snelacties';

/**
 * De lijst uit TradingIntel.tsx, met de hand overgenomen.
 *
 * Met opzet een kopie en geen import: die staat in een paginacomponent die de
 * halve desk meesleept, en een domeintest hoort geen React te laden. De test
 * hieronder is er juist om te merken dát ze uit de pas lopen.
 */
const TAB_IDS = [
  'chart', 'research', 'brain', 'memory', 'frameworks', 'strategies',
  'correlatie', 'kalender', 'funnel', 'scorecard', 'accounts', 'demo',
];

describe('tabStijl', () => {
  it('kent elke tab van de desk', () => {
    const ontbreekt = TAB_IDS.filter(id => !(id in TAB_STIJL));
    expect(ontbreekt, 'deze tabs hebben geen icoon en geen kleur').toEqual([]);
  });

  it('heeft geen stijl voor een tab die niet bestaat', () => {
    // Andersom net zo belangrijk: een kleur voor een verdwenen tab betekent
    // dat de lijst hierboven achterloopt op de pagina.
    const teveel = Object.keys(TAB_STIJL).filter(id => !TAB_IDS.includes(id));
    expect(teveel, 'deze stijlen horen bij geen enkele tab meer').toEqual([]);
  });

  it('geeft elke tab een eigen kleur', () => {
    const kleuren = Object.values(TAB_STIJL).map(s => s.kleur);
    expect(new Set(kleuren).size).toBe(kleuren.length);
  });

  it('houdt buren uit elkaar', () => {
    // Niet alle twaalf onderling -- twaalf kleuren ver uit elkaar bestaan niet
    // op één ring. Wel de tabs die NAAST elkaar staan, want dat zijn de twee
    // die je met elkaar verwart.
    for (let i = 1; i < TAB_IDS.length; i++) {
      const a = stijlVan(TAB_IDS[i - 1]).kleur;
      const b = stijlVan(TAB_IDS[i]).kleur;
      expect(accentAfstand(a, b), `${TAB_IDS[i - 1]} en ${TAB_IDS[i]}`).toBeGreaterThan(20);
    }
  });

  it('schrijft elke kleur als volledige hex', () => {
    for (const [id, s] of Object.entries(TAB_STIJL)) {
      expect(s.kleur, id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('valt terug op iets zichtbaars voor een onbekende tab', () => {
    // Een nieuwe tab hoort niet onzichtbaar te zijn tot iemand deze tabel
    // bijwerkt.
    expect(stijlVan('bestaat-niet')).toBe(TAB_TERUGVAL);
    expect(TAB_TERUGVAL.icoon.length).toBeGreaterThan(0);
  });
});
