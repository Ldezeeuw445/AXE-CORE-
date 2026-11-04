#!/usr/bin/env node
/**
 * Web builds must bake the public Supabase URL + anon key (VITE_*), otherwise
 * getSupabase() returns null and login shows "Supabase not configured".
 *
 * Desktop secrets must stay OUT of the web bundle (see check-no-secrets.mjs).
 * This gate only requires the two public auth vars — before vite, and again
 * after build by scanning the bundle for the URL + a non-empty anon JWT.
 *
 * Usage:
 *   node scripts/check-web-supabase-env.mjs
 *   node scripts/check-web-supabase-env.mjs --verify-bundle dist/public
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

function loadEnvFiles() {
  const env = { ...process.env };
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (env[key] == null || env[key] === '') env[key] = value;
    }
  }
  return env;
}

function requireEnv() {
  const env = loadEnvFiles();
  const missing = [];
  for (const key of REQUIRED) {
    const v = (env[key] ?? '').trim();
    if (!v) missing.push(key);
  }
  if (missing.length) {
    console.error(
      'check-web-supabase-env: missing required public auth vars for build:web:\n  ' +
        missing.join('\n  ') +
        '\nSet them in the environment (or a supabase-only .env) before building. ' +
        'Do not bake desktop secrets into the web bundle.',
    );
    process.exit(1);
  }
  const url = env.VITE_SUPABASE_URL.trim();
  const anon = env.VITE_SUPABASE_ANON_KEY.trim();
  if (!url.includes('supabase')) {
    console.error('check-web-supabase-env: VITE_SUPABASE_URL does not look like a Supabase project URL');
    process.exit(1);
  }
  if (anon.length < 20) {
    console.error('check-web-supabase-env: VITE_SUPABASE_ANON_KEY looks too short');
    process.exit(1);
  }
  console.log('check-web-supabase-env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY present');
  return { url, anon };
}

function* walk(root) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|html)$/.test(name)) yield path;
  }
}

function verifyBundle(root, url) {
  if (!existsSync(root)) {
    console.error(`check-web-supabase-env: bundle root missing: ${root}`);
    process.exit(1);
  }
  let foundUrl = false;
  let foundAnonShape = false;
  const needle = url.replace(/\/$/, '');
  for (const path of walk(root)) {
    const text = readFileSync(path, 'utf8');
    if (text.includes(needle)) foundUrl = true;
    if (/qye="eyJ[^"]{20,}"/.test(text) || /eyJ[A-Za-z0-9_-]{80,}\.[A-Za-z0-9_-]+\./.test(text)) {
      foundAnonShape = true;
    }
  }
  if (!foundUrl || !foundAnonShape) {
    console.error(
      'check-web-supabase-env: web bundle is missing Supabase auth config ' +
        `(url=${foundUrl}, anon_shape=${foundAnonShape}). ` +
        'Rebuild with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set; do not deploy an empty-auth bundle.',
    );
    process.exit(1);
  }
  console.log('check-web-supabase-env: bundle contains Supabase URL + anon key shape');
}

const args = process.argv.slice(2);
const verifyIdx = args.indexOf('--verify-bundle');
if (verifyIdx === -1) {
  requireEnv();
} else {
  const root = args[verifyIdx + 1] || 'dist/public';
  const { url } = requireEnv();
  verifyBundle(root, url);
}
