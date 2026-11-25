import { describe, expect, it } from 'vitest';
import type { ProjectionPayload } from './projectionTypes';
import {
  antwoordHoortOpPodium,
  antwoordIsHuidig,
  streamVanDezeBeurt,
  heeftMarkdownTabel,
  heeftUrl,
  podiumDemoAan,
  podiumKaartenVan,
  podiumMaatVoor,
  soortVanMode,
} from './podium';

function payload(partial: Partial<ProjectionPayload> & Pick<ProjectionPayload, 'mode' | 'title'>): ProjectionPayload {
  return {
    id: partial.id ?? 'p1',
    createdAt: partial.createdAt ?? 1,
    source: partial.source ?? 'chat',
    ...partial,
  };
}

describe('podiumMaatVoor — inhoud bepaalt de maat', () => {
  it('kaart, html en tabel vullen het toneel', () => {
    expect(podiumMaatVoor('kaart')).toBe('vol');
    expect(podiumMaatVoor('html')).toBe('vol');
    expect(podiumMaatVoor('tabel')).toBe('vol');
  });

  it('beeld en grafiek blijven medium, agenten compact', () => {
    expect(podiumMaatVoor('beeld')).toBe('medium');
    expect(podiumMaatVoor('grafiek')).toBe('medium');
    expect(podiumMaatVoor('agenten')).toBe('compact');
  });

  it('korte tekst blijft compact, lange groeit', () => {
    expect(podiumMaatVoor('antwoord', 80)).toBe('compact');
    expect(podiumMaatVoor('antwoord', 500)).toBe('medium');
    expect(podiumMaatVoor('antwoord', 2000)).toBe('vol');
  });
});

describe('heeftMarkdownTabel / heeftUrl', () => {
  it('herkent een GFM-tabel en geen losse pipe', () => {
    expect(heeftMarkdownTabel('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe(true);
    expect(heeftMarkdownTabel('gewoon | een zin')).toBe(false);
  });

  it('herkent een url of markdown-link', () => {
    expect(heeftUrl('zie https://axecompanion.com')).toBe(true);
    expect(heeftUrl('[Trading OS](https://tradingosapp.com)')).toBe(true);
    expect(heeftUrl('geen link hier')).toBe(false);
  });
});

describe('antwoordHoortOpPodium', () => {
  it('slaat knikken en home-commando-bevestigingen over', () => {
    expect(antwoordHoortOpPodium('ok')).toBe(false);
    expect(antwoordHoortOpPodium('Staat op de bol.')).toBe(false);
    expect(antwoordHoortOpPodium('Notch is dicht.')).toBe(false);
    expect(antwoordHoortOpPodium('North Sea freight is quiet today.')).toBe(true);
  });
});

describe('antwoordIsHuidig / streamVanDezeBeurt', () => {
  it('houdt het vast terwijl AXE deze beurt spreekt', () => {
    expect(antwoordIsHuidig({ voiceStatus: 'speaking', laatsteAxeTs: 20, laatsteUserTs: 10 })).toBe(true);
    expect(streamVanDezeBeurt({ voiceStatus: 'speaking', laatsteAxeTs: 20, laatsteUserTs: 10 })).toBe(true);
    expect(streamVanDezeBeurt({ voiceStatus: 'processing', laatsteAxeTs: null, laatsteUserTs: 10 })).toBe(true);
  });

  it('neemt een achtergebleven response niet mee bij een nieuwe vraag', () => {
    expect(streamVanDezeBeurt({ voiceStatus: 'processing', laatsteAxeTs: 10, laatsteUserTs: 20 })).toBe(false);
    expect(antwoordIsHuidig({
      voiceStatus: 'processing', laatsteAxeTs: 10, laatsteUserTs: 20, heeftStream: true,
    })).toBe(false);
    expect(antwoordIsHuidig({ voiceStatus: 'idle', heeftStream: true, laatsteAxeTs: 10, laatsteUserTs: 20 })).toBe(false);
  });

  it('veegt het oude antwoord weg zodra er een nieuwere vraag is', () => {
    expect(antwoordIsHuidig({ voiceStatus: 'idle', laatsteAxeTs: 10, laatsteUserTs: 20 })).toBe(false);
    expect(antwoordIsHuidig({ voiceStatus: 'idle', laatsteAxeTs: 20, laatsteUserTs: 10 })).toBe(true);
    expect(antwoordIsHuidig({ voiceStatus: 'idle', laatsteAxeTs: null })).toBe(false);
  });
});

describe('podiumKaartenVan — echte bronnen, geen verzonnen kaarten', () => {
  it('lege stand: alleen niets, tot er agents lopen', () => {
    expect(podiumKaartenVan({
      phase: 'idle', payload: null, voiceStatus: 'idle', agenten: 0, goedkeuringen: 0,
    })).toEqual([]);
  });

  it('zet het AXE-antwoord als compacte kaart als er geen projectie is', () => {
    const kaarten = podiumKaartenVan({
      phase: 'idle',
      payload: null,
      antwoord: 'Freight rates into Rotterdam are holding.',
      vraag: 'How is Rotterdam?',
      voiceStatus: 'speaking',
      agenten: 0,
      goedkeuringen: 0,
    });
    expect(kaarten).toHaveLength(1);
    expect(kaarten[0]).toMatchObject({
      id: 'antwoord',
      soort: 'antwoord',
      maat: 'compact',
      titel: 'How is Rotterdam?',
    });
  });

  it('projectie wint van de tekstkaart, agents blijven erbij', () => {
    const kaarten = podiumKaartenVan({
      phase: 'projecting',
      payload: payload({ mode: 'map', title: 'New York', id: 'map-1' }),
      antwoord: 'Here is New York on the map.',
      voiceStatus: 'speaking',
      agenten: 3,
      goedkeuringen: 1,
    });
    expect(kaarten.map((k) => k.soort)).toEqual(['kaart', 'agenten']);
    expect(kaarten[0].maat).toBe('vol');
    expect(kaarten[1].titel).toBe('3 agents working · 1 needs your OK');
  });

  it('een markdown-tabel in het antwoord wordt vol', () => {
    const kaarten = podiumKaartenVan({
      phase: 'idle',
      payload: null,
      antwoord: '| Port | Rate |\n| --- | --- |\n| RTM | 12 |',
      voiceStatus: 'idle',
      agenten: 0,
      goedkeuringen: 0,
    });
    expect(kaarten[0].soort).toBe('tabel');
    expect(kaarten[0].maat).toBe('vol');
  });

  it('soortVanMode volgt de projectie', () => {
    expect(soortVanMode('chart')).toBe('grafiek');
    expect(soortVanMode('image')).toBe('beeld');
    expect(soortVanMode('document', '| a | b |\n| --- | --- |')).toBe('tabel');
  });
});

describe('podiumDemoAan', () => {
  it('alleen in DEV met de vlag, nooit in productie', () => {
    expect(podiumDemoAan('1', true)).toBe(true);
    expect(podiumDemoAan('1', false)).toBe(false);
    expect(podiumDemoAan(null, true)).toBe(false);
  });
});
