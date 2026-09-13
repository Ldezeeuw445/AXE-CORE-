import { describe, it, expect } from 'vitest';
import { APPS, NAAST_CORE, STANDAARD_APP, appVan, appMeta, isAppId, metMetaApp } from './apps';
import { accentAfstand } from './snelacties';

describe('apps', () => {
  it('heeft AXE Core plus de vier die ernaast staan', () => {
    expect(APPS).toHaveLength(NAAST_CORE.length + 1);
    expect(APPS.some(a => a.id === STANDAARD_APP)).toBe(true);
  });

  it('zet AXE Core NIET tussen de vier', () => {
    // Hij staat apart, over de volle breedte: hij draait zijn werk lokaal en de
    // vier anderen gaan over een webhook. Staat hij in beide lijsten, dan komt
    // hij twee keer op het scherm.
    expect(NAAST_CORE).not.toContain(STANDAARD_APP);
  });

  it('geeft elke app een eigen id en een eigen kleur', () => {
    expect(new Set(APPS.map(a => a.id)).size).toBe(APPS.length);
    expect(new Set(APPS.map(a => a.kleur)).size).toBe(APPS.length);
  });

  it('houdt de kleuren ver genoeg uit elkaar om te onderscheiden', () => {
    for (let i = 0; i < APPS.length; i++) {
      for (let j = i + 1; j < APPS.length; j++) {
        expect(accentAfstand(APPS[i].kleur, APPS[j].kleur), `${APPS[i].id} / ${APPS[j].id}`)
          .toBeGreaterThan(40);
      }
    }
  });
});

describe('appVan', () => {
  it('leest de app uit metadata', () => {
    expect(appVan({ app: 'trading_os' })).toBe('trading_os');
  });

  it('valt terug op AXE Core bij niets, leeg of onzin', () => {
    // Terugvallen en niet verbergen: een taak die nergens te zien is blijft wél
    // bestaan, en dat ontdek je pas als het iets kapotmaakt.
    expect(appVan(undefined)).toBe(STANDAARD_APP);
    expect(appVan(null)).toBe(STANDAARD_APP);
    expect(appVan({})).toBe(STANDAARD_APP);
    expect(appVan({ app: 'bestaat-niet' })).toBe(STANDAARD_APP);
    expect(appVan({ app: 42 })).toBe(STANDAARD_APP);
  });
});

describe('appMeta', () => {
  it('geeft altijd iets terug, ook voor een id dat niet meer bestaat', () => {
    expect(appMeta('axon_memory').label).toBe('AXON Memory');
    // @ts-expect-error — met opzet: dit is het geval uit een oude opgeslagen rij.
    expect(appMeta('weg').label).toBe(APPS[0].label);
  });
});

describe('metMetaApp', () => {
  it('zet de app erin zonder de rest weg te gooien', () => {
    expect(metMetaApp('northsea', { bron: 'chat' })).toEqual({ bron: 'chat', app: 'northsea' });
  });

  it('overschrijft een oude app in plaats van er twee te laten staan', () => {
    expect(metMetaApp('northsea', { app: 'axe_core' })).toEqual({ app: 'northsea' });
  });
});

describe('isAppId', () => {
  it('kent alleen de vijf', () => {
    expect(isAppId('axe_core')).toBe(true);
    expect(isAppId('AXE_CORE')).toBe(false);
    expect(isAppId(null)).toBe(false);
  });
});
