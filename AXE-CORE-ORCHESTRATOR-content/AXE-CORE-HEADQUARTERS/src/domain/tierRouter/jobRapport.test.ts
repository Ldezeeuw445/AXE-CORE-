/**
 * Het rapport dat een klare taak achterlaat.
 *
 * Wat hier echt kapot kan: een rapport over een taak die nog loopt (dan staat er
 * "klaar" boven werk dat niet klaar is), een rapport zonder inhoud (ruis die
 * later als kennis terugkomt), en een sleutel die niet stabiel is (dan groeit het
 * geheugen met een nieuwe rij per poging in plaats van één rij per taak).
 */
import { describe, it, expect } from 'vitest';
import { jobRapportVan } from './jobRapport';
import { mapVanSleutel } from '@/domain/memory/mappen';
import type { AxeJob } from './axeJobRegels';

const job = (over: Partial<AxeJob> = {}): AxeJob => ({
  id: 'j1',
  title: 'Onderzoek lithium',
  agent: 'browser',
  state: 'done',
  startedAt: 1_000_000,
  finishedAt: 1_000_000 + 42_000,
  summary: 'Drie bronnen, twee zijn het oneens over de vraagprognose.',
  sourceText: 'Deep research naar de lithiummarkt',
  ...over,
});

describe('jobRapportVan', () => {
  it('maakt een rapport met de opdracht, de uitkomst en wie het deed', () => {
    const r = jobRapportVan(job())!;
    expect(r.inhoud).toContain('# Onderzoek lithium');
    expect(r.inhoud).toContain('browser');
    expect(r.inhoud).toContain('klaar');
    expect(r.inhoud).toContain('Deep research naar de lithiummarkt');
    expect(r.inhoud).toContain('Drie bronnen');
    expect(r.inhoud).toContain('Duur: 42 s');
  });

  it('zet het in de projects-map', () => {
    const r = jobRapportVan(job())!;
    expect(mapVanSleutel(r.sleutel)).toBe('projects');
    expect(r.tags).toContain('rapport');
  });

  it('geeft dezelfde sleutel voor dezelfde taak -- anders is het geen upsert', () => {
    expect(jobRapportVan(job())!.sleutel).toBe(jobRapportVan(job())!.sleutel);
    expect(jobRapportVan(job({ id: 'j2' }))!.sleutel).not.toBe(jobRapportVan(job())!.sleutel);
  });

  it('rapporteert ook een taak die stopte -- dat wil je over een week nog weten', () => {
    const r = jobRapportVan(job({ state: 'failed', summary: 'De VPS antwoordde niet.' }))!;
    expect(r.inhoud).toContain('gestopt');
    expect(r.inhoud).toContain('Waar het op stopte');
    expect(r.inhoud).toContain('De VPS antwoordde niet.');
    expect(r.tags).toContain('gestopt');
  });

  it('schrijft niets over werk dat nog loopt', () => {
    for (const state of ['queued', 'running', 'waiting'] as const) {
      expect(jobRapportVan(job({ state })), state).toBeNull();
    }
  });

  it('schrijft niets zonder samenvatting -- een titel alleen is ruis', () => {
    expect(jobRapportVan(job({ summary: undefined }))).toBeNull();
    expect(jobRapportVan(job({ summary: '   ' }))).toBeNull();
  });

  it('laat de duur weg als hij niet te weten is, in plaats van 0 te zeggen', () => {
    const r = jobRapportVan(job({ finishedAt: undefined }))!;
    expect(r.inhoud).not.toContain('Duur:');
  });

  it('kapt een enorme samenvatting af in plaats van het geheugen vol te schrijven', () => {
    const r = jobRapportVan(job({ summary: 'x'.repeat(20_000) }))!;
    expect(r.inhoud.length).toBeLessThan(7000);
  });
});
