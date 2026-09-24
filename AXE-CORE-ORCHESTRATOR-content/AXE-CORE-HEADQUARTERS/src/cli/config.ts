/**
 * Config uit env of een lokaal bestand. Nooit hardcoded, nooit geheimen printen.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AxeConfig {
  apiUrl: string;
  apiKey: string;
  userId: string;
  actor: string;
  memoryBackend: 'rag' | 'axon';
  nodeMac: string;
  nodeVps: string;
  timeoutSec: number;
  configPath?: string;
}

const DEFAULTS: Omit<AxeConfig, 'apiKey'> = {
  apiUrl: 'https://api.axecompanion.com',
  userId: 'acff7a12-1111-481d-a7a9-cc07583b8069',
  actor: 'axe',
  memoryBackend: 'rag',
  nodeMac: 'mac-mini',
  nodeVps: 'vps',
  timeoutSec: 30,
};

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

export function configCandidates(explicit?: string): string[] {
  const out: string[] = [];
  if (explicit) out.push(explicit);
  if (process.env.AXE_CONFIG) out.push(process.env.AXE_CONFIG);
  out.push(join(homedir(), '.config', 'axe', 'config.json'));
  out.push(join(homedir(), '.axe.json'));
  out.push(join(process.cwd(), '.axe.json'));
  return out;
}

export function loadConfig(explicit?: string): AxeConfig {
  let file: Record<string, unknown> = {};
  let used: string | undefined;
  for (const p of configCandidates(explicit)) {
    if (existsSync(p)) {
      file = readJson(p);
      used = p;
      break;
    }
  }

  const memory = str(process.env.AXE_MEMORY_BACKEND ?? file.memoryBackend, DEFAULTS.memoryBackend);
  return {
    apiUrl: str(process.env.AXE_API_URL ?? file.apiUrl, DEFAULTS.apiUrl).replace(/\/$/, ''),
    apiKey: str(process.env.AXE_API_KEY ?? file.apiKey, ''),
    userId: str(process.env.AXE_USER_ID ?? file.userId, DEFAULTS.userId),
    actor: str(process.env.AXE_ACTOR ?? file.actor, DEFAULTS.actor),
    memoryBackend: memory === 'axon' ? 'axon' : 'rag',
    nodeMac: str(process.env.AXE_NODE_MAC ?? file.nodeMac, DEFAULTS.nodeMac),
    nodeVps: str(process.env.AXE_NODE_VPS ?? file.nodeVps, DEFAULTS.nodeVps),
    timeoutSec: Number(process.env.AXE_TIMEOUT ?? file.timeoutSec ?? DEFAULTS.timeoutSec) || DEFAULTS.timeoutSec,
    configPath: used,
  };
}

/** Publieke view: dezelfde velden, sleutel weggelaten. */
export function publicConfig(cfg: AxeConfig): Omit<AxeConfig, 'apiKey'> & { apiKey: string } {
  return { ...cfg, apiKey: cfg.apiKey ? '[REDACTED]' : '' };
}
