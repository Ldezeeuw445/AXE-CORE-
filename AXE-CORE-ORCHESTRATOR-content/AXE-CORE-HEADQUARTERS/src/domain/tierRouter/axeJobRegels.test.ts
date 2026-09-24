import { describe, it, expect } from 'vitest';
import {
  balkLabel,
  bouwMultiAck,
  jobAgentVan,
  jobResultaatTekst,
  moetSpraakWachtrij,
  northseaJobModus,
  sessieSamenvatting,
  stemlusOvergang,
  type AxeJob,
} from './axeJobRegels';
import { classifyAxeTier } from './axeRoute';

const job = (over: Partial<AxeJob> = {}): AxeJob => ({
  id: 'j1',
  title: 'check deals',
  agent: 'northsea',
  state: 'running',
  startedAt: 1,
  sourceText: 'check NorthSea deals',
  ...over,
});

describe('stemlusOvergang', () => {
  it('barge-in stopt TTS en gaat terug naar luisteren', () => {
    const k = stemlusOvergang('speaking', { type: 'barge-in' });
    expect(k.stand).toBe('listening');
    expect(k.stopTts).toBe(true);
    expect(k.speakNow).toBe(false);
  });

  it('Esc stopt alles', () => {
    const k = stemlusOvergang('listening', { type: 'esc' });
    expect(k.stand).toBe('idle');
    expect(k.stopTts).toBe(true);
    expect(k.cancelListen).toBe(true);
  });

  it('job-resultaat tijdens luisteren gaat in de wachtrij', () => {
    const k = stemlusOvergang('listening', { type: 'job-result' });
    expect(k.queueSpeech).toBe(true);
    expect(k.speakNow).toBe(false);
    expect(k.stopTts).toBe(false);
    expect(k.stand).toBe('listening');
  });

  it('job-resultaat in rust mag nu', () => {
    const k = stemlusOvergang('idle', { type: 'job-result' });
    expect(k.speakNow).toBe(true);
    expect(k.queueSpeech).toBe(false);
  });

  it('foutstand', () => {
    expect(stemlusOvergang('thinking', { type: 'fail' }).stand).toBe('error');
  });
});

describe('moetSpraakWachtrij', () => {
  it('ack praat meteen, job wacht op de gebruiker', () => {
    expect(moetSpraakWachtrij('listening', 'ack')).toBe(false);
    expect(moetSpraakWachtrij('listening', 'job')).toBe(true);
    expect(moetSpraakWachtrij('idle', 'job')).toBe(false);
  });
});

describe('sessie-samenvatting', () => {
  it('leeg en gevuld', () => {
    expect(sessieSamenvatting([])).toMatch(/Nothing running/);
    const tekst = sessieSamenvatting([
      job(),
      job({ id: 'j2', agent: 'task', state: 'done', title: 'tomorrow', summary: 'Task created' }),
    ]);
    expect(tekst).toMatch(/1 agent running/);
    expect(tekst).toMatch(/Task created/);
  });

  it('ack en balk', () => {
    expect(bouwMultiAck([
      { text: 'a', agent: 'northsea' },
      { text: 'b', agent: 'task' },
    ])).toMatch(/2 jobs/);
    expect(balkLabel(3)).toBe('3 agents running');
    expect(jobResultaatTekst(job({ state: 'done', summary: '3 open deals' }))).toMatch(/3 open deals/);
    expect(northseaJobModus('northsea')).toBe('read');
    expect(northseaJobModus('trading')).toBe('execute');
  });
});

describe('jobAgentVan', () => {
  it('houdt NorthSea en nieuws uit de fallback-agent', () => {
    expect(jobAgentVan(classifyAxeTier('check NorthSea deals'), 'check NorthSea deals')).toBe('northsea');
    expect(jobAgentVan(classifyAxeTier('vat het AI-nieuws samen'), 'vat het AI-nieuws samen')).toBe('intel');
    expect(jobAgentVan(classifyAxeTier('zet een taak voor morgen'), 'zet een taak voor morgen')).toBe('task');
  });
});
