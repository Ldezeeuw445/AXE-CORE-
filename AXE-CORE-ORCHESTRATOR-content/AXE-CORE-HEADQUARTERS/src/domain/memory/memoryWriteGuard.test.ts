import { describe, expect, it } from 'vitest';
import {
  GEHEUGEN_MAG_PER_DAG,
  inhoudHash,
  isNoopMemory,
  isRunLogKey,
  magGeheugenSchrijven,
  sleutelMetHash,
  stabieleSleutel,
} from './memoryWriteGuard';

describe('memoryWriteGuard', () => {
  it('weiger HOLD, skip en lege rijen', () => {
    expect(isNoopMemory('HOLD score=0.012')).toBe(true);
    expect(isNoopMemory('no change')).toBe(true);
    expect(isNoopMemory('skipped')).toBe(true);
    expect(isNoopMemory('{"action":"hold","score":0.1}')).toBe(true);
    expect(isNoopMemory('')).toBe(true);
    expect(isNoopMemory('stopped out on the retest')).toBe(false);
  });

  it('zet cron-runs en cycle-logs buiten het geheugen', () => {
    expect(isRunLogKey('agent_run:cron:3f6b6442-c959-47dc-9ad5-7abc:1760000000')).toBe(true);
    expect(isRunLogKey('agent_run:1760000000:abc123')).toBe(true);
    expect(isRunLogKey('ta:axe_trading_agent:cycle:d38b0230-358e-45a7-98aa')).toBe(true);
    expect(isRunLogKey('ta:axe_trading_agent:lesson:XAUUSD:abc')).toBe(false);
  });

  it('maakt van een timestamp-sleutel één stabiele sleutel plus inhoudshash', () => {
    expect(stabieleSleutel('ta:axe_trading_agent:lesson:XAUUSD:1787700000000'))
      .toBe('ta:axe_trading_agent:lesson:XAUUSD');
    expect(stabieleSleutel('agent_run:cron:3f6b6442-c959-47dc-9ad5-7123456789ab:1760000000'))
      .toBe('agent_run:cron:3f6b6442-c959-47dc-9ad5-7123456789ab');
    const h = inhoudHash('stopped out on the retest');
    expect(sleutelMetHash('ta:axe_trading_agent:lesson:XAUUSD:1787700000000', h))
      .toBe(`ta:axe_trading_agent:lesson:XAUUSD:${h}`);
  });

  it('dezelfde inhoud krijgt dezelfde hash', () => {
    expect(inhoudHash('  les  ')).toBe(inhoudHash('les'));
    expect(inhoudHash('les A')).not.toBe(inhoudHash('les B'));
  });

  it('cap en duplicaat blokkeren, echte les niet', () => {
    const les = 'sized too wide into news';
    expect(magGeheugenSchrijven({ content: les })).toBe('ok');
    expect(magGeheugenSchrijven({ content: les, bestaandeHash: inhoudHash(les) })).toBe('duplicate');
    expect(magGeheugenSchrijven({ content: les, vandaagAl: GEHEUGEN_MAG_PER_DAG })).toBe('cap');
    expect(magGeheugenSchrijven({ content: 'HOLD score=0.1' })).toBe('noop');
    expect(magGeheugenSchrijven({ key: 'agent_run:cron:x:1', content: 'Cron fired' })).toBe('run_log');
  });
});
