/**
 * Ingang van de axe-commandolaag. Wordt aangeroepen door cli/axe (Python)
 * via dezelfde regels, of door tests. Geen geheimen op stdout.
 */

import { createHttp } from './client';
import { execute } from './commands';
import { loadConfig } from './config';
import { envelope, printEnvelope } from './envelope';
import { pickMemoryBackend } from './memoryPort';
import { parseArgv, UsageError } from './parse';

export async function runArgv(argv: string[]): Promise<{ text: string; exit: number }> {
  let parsed;
  try {
    parsed = parseArgv(argv);
  } catch (e) {
    const env = envelope({
      command: 'help',
      status: 'usage',
      error: e instanceof UsageError ? e.message : String(e),
    });
    return { text: printEnvelope(env, true), exit: env.exit };
  }

  if (parsed.help && parsed.path !== 'help') {
    parsed = { ...parsed, path: 'help' };
  }

  const cfg = loadConfig(parsed.configPath);
  if (parsed.timeoutSec) cfg.timeoutSec = parsed.timeoutSec;
  if (parsed.actor) cfg.actor = parsed.actor;

  if (parsed.path !== 'help' && parsed.path !== 'status' && !cfg.apiKey) {
    const env = envelope({
      command: parsed.path,
      status: 'config',
      error: 'AXE_API_KEY missing (env or config file). See os3/SETUP.md',
    });
    return { text: printEnvelope(env, parsed.json || true), exit: env.exit };
  }

  const http = createHttp(cfg);
  const memory = pickMemoryBackend(cfg.memoryBackend, http, cfg.userId);
  const env = await execute(parsed, { http, memory, config: cfg });
  return { text: printEnvelope(env, true), exit: env.exit };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { text, exit } = await runArgv(argv);
  process.stdout.write(text);
  return exit;
}
