/**
 * De ratel onder de vijf skills.
 *
 * Het punt van `axeSkills.ts` is dat één rij alles over een skill zegt. Deze
 * test houdt dat vast: komt er een skill bij, dan moet hij een echte
 * rosteragent hebben, een eigen aanroep, en een instructie die meer is dan de
 * naam. Dat laatste is niet pietluttig -- vóór 1 okt 2026 kreeg de agent jouw
 * eigen zin doorgestuurd ("inbox brief", twee woorden) en moest hij raden.
 */
import { describe, it, expect } from 'vitest';
import { AXE_SKILLS, isAxeSkill, skillDef, skillVanTekst, type AxeSkillId } from './axeSkills';
import { classifyAxeTier } from './axeRoute';
import { AXE_AGENTS } from '@/domain/agents/roster';

const ROSTER = new Set(AXE_AGENTS.map((a) => a.id));

describe('de tabel zelf', () => {
  it('heeft vijf skills, elk één keer', () => {
    expect(AXE_SKILLS).toHaveLength(5);
    const ids = AXE_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('wijst elke skill naar een agent die echt in het roster staat', () => {
    for (const s of AXE_SKILLS) {
      expect(ROSTER.has(s.agent), `${s.id} → ${s.agent}`).toBe(true);
    }
  });

  it('geeft elke skill een instructie die meer zegt dan zijn naam', () => {
    for (const s of AXE_SKILLS) {
      expect(s.request.length, s.id).toBeGreaterThan(80);
      expect(s.label.length, s.id).toBeGreaterThan(3);
      expect(s.uitleg.length, s.id).toBeGreaterThan(10);
    }
  });

  /* Luka's keuze van 1 okt 2026: lezen en voorstellen, niets zelf veranderen.
     De instructie moet dat ook zéggen -- een agent leest geen vlag. */
  it('zegt in elke instructie dat er niets veranderd mag worden', () => {
    for (const s of AXE_SKILLS) {
      expect(s.leestAlleen).toBe(true);
      expect(s.request, s.id).toMatch(/read-only/i);
      expect(s.request, s.id).toMatch(/propose/i);
    }
  });
});

describe('skillVanTekst', () => {
  const roept: Array<[string, AxeSkillId]> = [
    ['plan today', 'plan-today'],
    ['plan mijn dag', 'plan-today'],
    ['Plan De Dag', 'plan-today'],
    ['wat moet ik vandaag doen', 'plan-today'],
    ['inbox brief', 'inbox-brief'],
    ['inbox briefing', 'inbox-brief'],
    ['wat is er binnengekomen vandaag', 'inbox-brief'],
    ['intel brief', 'intel-brief'],
    ['weekly review', 'weekly-review'],
    ['weekoverzicht', 'weekly-review'],
    ['deep research naar lithium', 'deep-research'],
    ['doe eens diepgaand onderzoek naar de markt', 'deep-research'],
  ];

  it.each(roept)('%s → %s', (tekst, skill) => {
    expect(skillVanTekst(tekst)).toBe(skill);
  });

  it('elke skill is via zijn eigen label aan te roepen', () => {
    // Een knop stuurt het label; dan hoort hij bij dezelfde skill uit te komen
    // als wanneer je het typt. Anders doet de knop iets anders dan de zin.
    for (const s of AXE_SKILLS) {
      expect(skillVanTekst(s.label), s.label).toBe(s.id);
    }
  });

  it('laat een gewone zin met rust', () => {
    for (const tekst of ['', '   ', 'hey axe', 'hoe gaat het', 'fix the login bug', 'plan']) {
      expect(skillVanTekst(tekst), JSON.stringify(tekst)).toBeNull();
    }
  });

  /* `deep-research` matcht midden in een zin, de andere vier aan het begin.
     Daarom staat hij achteraan in de tabel: stond hij vooraan, dan zou
     "plan today, en deep research naar X" als deep-research beginnen. */
  it('laat de strakkere patronen voorgaan op deep-research', () => {
    expect(skillVanTekst('plan today en daarna deep research naar lithium')).toBe('plan-today');
  });
});

describe('skillDef en isAxeSkill', () => {
  it('vindt elke skill op zijn id', () => {
    for (const s of AXE_SKILLS) expect(skillDef(s.id)).toBe(s);
  });

  it('geeft null op wat geen skill is, zonder te gokken', () => {
    for (const naam of [null, undefined, '', 'plan', 'planToday', 'deep_research']) {
      expect(skillDef(naam), String(naam)).toBeNull();
      expect(isAxeSkill(naam), String(naam)).toBe(false);
    }
  });
});

describe('de router gebruikt deze tabel, niet een eigen lijst', () => {
  it('neemt agent en tier over uit de definitie', () => {
    for (const s of AXE_SKILLS) {
      const route = classifyAxeTier(s.label);
      expect(route.skill, s.label).toBe(s.id);
      expect(route.agent, s.label).toBe(s.agent);
      expect(route.tier, s.label).toBe(s.tier);
      expect(route.reason, s.label).toBe(`skill:${s.id}`);
      expect(route.confident).toBe(true);
    }
  });

  /* Vóór deze ronde zat de agentkeuze als if-keten in classifyAxeTier. Deze twee
     zijn de enige die níet 'axe' zijn, en dus de twee die stil zouden wegvallen
     als iemand de tabel aanpast en de keten vergeet. */
  it('houdt intel-brief bij intel en deep-research bij browser', () => {
    expect(classifyAxeTier('intel brief').agent).toBe('intel');
    expect(classifyAxeTier('deep research naar lithium').agent).toBe('browser');
  });
});
