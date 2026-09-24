import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { capabilityFor } from './commands';
import { createHttp } from './client';
import { configCandidates, loadConfig, publicConfig } from './config';
import { axonMemoryBackend, pickMemoryBackend, ragMemoryBackend } from './memoryPort';
import { main, runArgv } from './main';

const HQ = join(__dirname, '../..');

describe('axe-laag is aangesloten', () => {
  it('cli/axe start de Python-laag', () => {
    const tekst = readFileSync(join(HQ, 'cli/axe'), 'utf8');
    expect(tekst).toMatch(/axe_laag/);
    expect(tekst).toMatch(/python3/);
  });

  it('help --json werkt zonder netwerk', () => {
    const r = spawnSync('python3', [join(HQ, 'cli/axe'), 'help', '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout) as { ok: boolean; result: { help: string } };
    expect(data.ok).toBe(true);
    expect(data.result.help).toMatch(/axe status/);
  });

  it('blokkeert verstuur in het echte commando', () => {
    const r = spawnSync(
      'python3',
      [join(HQ, 'cli/axe'), 'agent', 'run', 'northsea', 'verstuur dit', '--write', '--json'],
      { encoding: 'utf8', env: { ...process.env, AXE_API_KEY: 'test' } },
    );
    const data = JSON.parse(r.stdout) as { status: string };
    expect(data.status).toBe('blocked');
    expect(r.status).toBe(3);
  });

  it('houdt de poorten en de catalogus bij elkaar', () => {
    expect(capabilityFor('developer')).toBe('code');
    expect(configCandidates().length).toBeGreaterThan(0);
    expect(publicConfig(loadConfig()).apiKey).toBe('');
    const http = { get: async () => ({}), post: async () => ({}), patch: async () => ({}) };
    expect(typeof createHttp).toBe('function');
    expect(pickMemoryBackend('rag', http, 'u').name).toBe('rag');
    expect(ragMemoryBackend(http, 'u').name).toBe('rag');
    expect(axonMemoryBackend(http, 'u').name).toBe('axon');
    expect(typeof runArgv).toBe('function');
    expect(typeof main).toBe('function');
  });
});
