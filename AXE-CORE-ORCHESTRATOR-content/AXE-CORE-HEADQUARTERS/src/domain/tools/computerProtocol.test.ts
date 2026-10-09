import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COMPUTER_PROTOCOL } from './computerProtocol';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

// Luka, 9 okt: computer use "deed het niet". De worker weigerde elke actie met "native runtime mismatch",
// omdat hij de commit van de app met zijn eigen commit vergeleek.
describe('computer use: de app en de worker toetsen het protocol, niet de commit', () => {
  const worker = readFileSync(join(ROOT, 'infra/computer-worker/worker.mjs'), 'utf8');
  const relay = readFileSync(join(ROOT, 'src/infrastructure/gateways/computerRelay.ts'), 'utf8');

  it('de worker en de app hebben hetzelfde protocolnummer', () => {
    const m = /const WORKER_PROTOCOL = (\d+);/.exec(worker);
    expect(m, 'WORKER_PROTOCOL staat niet in worker.mjs').not.toBeNull();
    expect(Number(m![1])).toBe(COMPUTER_PROTOCOL);
  });

  it('de app stuurt het protocol mee met elke computer-taak', () => {
    expect(relay).toContain('client_protocol: COMPUTER_PROTOCOL');
  });

  it('de worker weigert alleen op een ander protocol, niet meer op een andere commit', () => {
    expect(worker).toMatch(/appProtocol !== WORKER_PROTOCOL/);
    expect(worker).not.toMatch(/appBuild !== workerBuild/);
    expect(worker).toContain('native protocol mismatch');
  });
});
