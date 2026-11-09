#!/usr/bin/env node
/**
 * Lintpoort: alleen NIEUWE eslint-vondsten t.o.v. eslint-baseline.json.
 *
 * Zelfde idee als de vitest-FAIL-lijst in AGENTS.md: de bestaande schuld is de
 * nullijn, een nieuwe vondst is een echte breuk. `npm run lint:all` (`eslint
 * src`) blijft de volle backlog. Dit script is `npm run lint` — wat de
 * bouwlus-poort draait.
 *
 * Terug naar groen: los vondsten op, daarna `npm run lint:baseline` (krimpt
 * het bestand). Groeien verbergt nieuwe fouten; doe dat niet.
 *
 *   node scripts/eslint-gate.mjs           # poort (exit 1 bij nieuwe vondsten)
 *   node scripts/eslint-gate.mjs --write   # schrijf huidige vondsten als basis
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASIS_NAAM = 'eslint-baseline.json';
export const REGELS_MAX = 8;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function normBestand(pad, cwd = ROOT) {
  const ruw = String(pad || '').replace(/\\/g, '/');
  const rel = ruw.startsWith('/') || /^[A-Za-z]:\//.test(ruw)
    ? relative(cwd, ruw).replace(/\\/g, '/')
    : ruw.replace(/^\.\//, '');
  const src = rel.indexOf('/src/');
  if (src >= 0) return rel.slice(src + 1);
  if (rel.startsWith('src/')) return rel;
  return rel || ruw;
}

export function normBericht(msg) {
  // react-hooks plakt een code-frame met het absolute pad; dat verschilt per machine.
  return String(msg || '').split('\n')[0].trim();
}

export function vinger(v) {
  return `${normBestand(v.file)}\t${v.rule || ''}\t${normBericht(v.message)}`;
}

export function vondstRegel(v) {
  const file = normBestand(v.file);
  const plek = v.line ? `${file}:${v.line}${v.column ? `:${v.column}` : ''}` : file;
  return `${plek}  ${v.severity || 'error'}  ${v.rule || '?'}  ${normBericht(v.message)}`;
}

export function findingsFromEslintJson(results, cwd = ROOT) {
  const uit = [];
  if (!Array.isArray(results)) return uit;
  for (const f of results) {
    const file = normBestand(f?.filePath, cwd);
    for (const m of f?.messages || []) {
      uit.push({
        file,
        line: m.line ?? null,
        column: m.column ?? null,
        severity: m.severity === 1 ? 'warning' : 'error',
        rule: m.ruleId || 'eslint',
        message: normBericht(m.message),
      });
    }
  }
  return uit;
}

export function serializeBaseline(findings) {
  const tel = new Map();
  for (const v of findings) {
    const k = vinger(v);
    const cur = tel.get(k);
    if (cur) cur.count += 1;
    else {
      tel.set(k, {
        file: normBestand(v.file),
        rule: v.rule || '',
        message: normBericht(v.message),
        count: 1,
      });
    }
  }
  const list = [...tel.values()].sort((a, b) =>
    a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message));
  return {
    version: 1,
    note: 'Known eslint findings (file + rule + message). npm run lint fails only on fingerprints not in this file. After a real fix: npm run lint:baseline (shrinks). Do not grow this to hide new errors.',
    findings: list,
  };
}

export function loadBaseline(data) {
  const tel = new Map();
  for (const f of data?.findings || []) {
    const k = `${f.file}\t${f.rule}\t${f.message}`;
    tel.set(k, (tel.get(k) || 0) + Number(f.count || 1));
  }
  return tel;
}

/** Huidige vondsten die de basis niet dekt, in bronvolgorde, met regelnummer. */
export function nieuweVondsten(huidig, basis) {
  const rest = new Map(basis);
  const nieuw = [];
  for (const v of huidig) {
    const k = vinger(v);
    const n = rest.get(k) || 0;
    if (n > 0) rest.set(k, n - 1);
    else nieuw.push(v);
  }
  return nieuw;
}

export function verdwenenVondsten(huidig, basis) {
  const tel = new Map();
  for (const v of huidig) {
    const k = vinger(v);
    tel.set(k, (tel.get(k) || 0) + 1);
  }
  let n = 0;
  for (const [k, was] of basis) {
    const nu = tel.get(k) || 0;
    if (was > nu) n += was - nu;
  }
  return n;
}

function eslintJson(root = ROOT) {
  const bin = join(root, 'node_modules/eslint/bin/eslint.js');
  if (!existsSync(bin)) {
    return { ok: false, error: 'eslint is unavailable (no node_modules/eslint)' };
  }
  const r = spawnSync(process.execPath, [bin, 'src', '-f', 'json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CI: 'true' },
  });
  if (r.error) return { ok: false, error: r.error.message };
  const stdout = r.stdout || '';
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start < 0 || end < start) {
    const tekst = (stdout + (r.stderr || '')).trim() || `eslint exit ${r.status}`;
    return { ok: false, error: tekst.slice(-1500) };
  }
  try {
    return { ok: true, results: JSON.parse(stdout.slice(start, end + 1)), status: r.status };
  } catch (e) {
    return { ok: false, error: `eslint JSON: ${e.message}` };
  }
}

function printRegels(vondsten, n = REGELS_MAX) {
  for (const v of vondsten.slice(0, n)) console.log(vondstRegel(v));
  if (vondsten.length > n) console.log(`+${vondsten.length - n} more`);
}

export function poortTekst(nieuw, bekend) {
  if (nieuw.length) {
    return `eslint-gate: FAIL ${nieuw.length} new / ${bekend} known`;
  }
  return `eslint-gate: OK ${bekend} known, 0 new`;
}

function schrijf(root, findings) {
  const pad = join(root, BASIS_NAAM);
  const vorige = existsSync(pad) ? loadBaseline(JSON.parse(readFileSync(pad, 'utf8'))) : new Map();
  const data = serializeBaseline(findings);
  writeFileSync(pad, `${JSON.stringify(data, null, 2)}\n`);
  const nu = loadBaseline(data);
  const nieuw = [...nu.keys()].filter((k) => (nu.get(k) || 0) > (vorige.get(k) || 0)).length;
  const weg = verdwenenVondsten(findings, vorige);
  if (nieuw) {
    console.warn(`Wrote ${data.findings.length} fingerprints (+${nieuw} grew, -${weg} shrunk). Growing hides new errors.`);
  } else {
    console.log(`Wrote ${data.findings.length} fingerprints (${weg} fewer than before).`);
  }
}

export function main(argv = process.argv.slice(2), root = ROOT) {
  const write = argv.includes('--write');
  const draai = eslintJson(root);
  if (!draai.ok) {
    console.error(`eslint-gate: ${draai.error}`);
    return 1;
  }
  const findings = findingsFromEslintJson(draai.results, root);
  const pad = join(root, BASIS_NAAM);
  if (write) {
    schrijf(root, findings);
    return 0;
  }
  if (!existsSync(pad)) {
    console.error(`eslint-gate: missing ${BASIS_NAAM}. Run npm run lint:baseline once to record the known backlog, then keep it from growing.`);
    printRegels(findings);
    return 1;
  }
  let basis;
  try {
    basis = loadBaseline(JSON.parse(readFileSync(pad, 'utf8')));
  } catch (e) {
    console.error(`eslint-gate: could not read ${BASIS_NAAM}: ${e.message}`);
    return 1;
  }
  const nieuw = nieuweVondsten(findings, basis);
  const bekend = findings.length - nieuw.length;
  console.log(poortTekst(nieuw, bekend));
  if (nieuw.length) {
    printRegels(nieuw);
    console.error('Fix the new findings. After a real cleanup: npm run lint:baseline (shrinks). Do not grow the baseline to hide new errors.');
    return 1;
  }
  return 0;
}

const hier = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(hier).href) {
  process.exit(main());
}
