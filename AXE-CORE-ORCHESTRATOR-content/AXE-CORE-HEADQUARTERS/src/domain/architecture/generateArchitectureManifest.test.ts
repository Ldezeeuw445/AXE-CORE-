import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KNOWN_ARCHITECTURE_APPS,
  KNOWN_ARCHITECTURE_PROJECTS,
  KNOWN_ARCHITECTURE_SERVICES,
  KNOWN_ARCHITECTURE_TABLES,
  KNOWN_ARCHITECTURE_WORKERS,
} from './architectureInventory';
import { generateArchitectureManifest, missingArchitectureInventory } from './generateArchitectureManifest';
import { collectArchitectureFiles, headquartersRoot } from './readArchitectureFiles';

const SNAPSHOT = resolve(headquartersRoot(), 'src/domain/architecture/architecture.generated.json');

describe('generateArchitectureManifest', () => {
  const files = collectArchitectureFiles();
  const manifest = generateArchitectureManifest(files);

  it('reads the real HQ sources, not an empty fixture', () => {
    expect(Object.keys(files).some(path => path.endsWith('vps_sync.py'))).toBe(true);
    expect(Object.keys(files).some(path => path.includes('productregister'))).toBe(true);
    expect(Object.keys(files).some(path => path.endsWith('programma.json'))).toBe(true);
    expect(manifest.nodes.length).toBeGreaterThan(40);
    expect(manifest.edges.length).toBeGreaterThan(20);
  });

  it('fails when a known service, table, app or project is missing', () => {
    expect(missingArchitectureInventory(manifest, {
      apps: KNOWN_ARCHITECTURE_APPS,
      services: KNOWN_ARCHITECTURE_SERVICES,
      tables: KNOWN_ARCHITECTURE_TABLES,
      projects: KNOWN_ARCHITECTURE_PROJECTS,
      workers: KNOWN_ARCHITECTURE_WORKERS,
    })).toEqual([]);
  });

  it('keeps the UI snapshot in lockstep with the generator', () => {
    if (process.env.AXE_WRITE_ARCHITECTURE === '1' || !existsSync(SNAPSHOT)) {
      writeFileSync(SNAPSHOT, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const committed = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as typeof manifest;
    expect(committed).toEqual(manifest);
  });
});
