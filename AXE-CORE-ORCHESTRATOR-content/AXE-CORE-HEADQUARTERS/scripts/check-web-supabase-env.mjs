#!/usr/bin/env node
/**
 * Web builds must bake the public Supabase URL + anon key (VITE_*), otherwise
 * getSupabase() returns null and login shows "Supabase not configured".
 *
 * Desktop secrets must stay OUT of the web bundle (see check-no-secrets.mjs).
 * This gate only requires the two public auth vars — before vite, and again
 * after build by scanning the bundle for the URL + the anon JWT itself.
 *
 * 4 nov 2026: de post-bundle-check keek naar `qye="eyJ…"`, de terser-naam
 * van één productiebuild, of naar een JWT waarvan het eerste segment ≥80
 * tekens is plus een extra punt achter de handtekening. Een legacy anon-JWT
 * van ~208 tekens heeft een header van ~36 tekens en stopt na de signature.
 * Vite bakte de sleutel wél in (nagemeten: `F0e="<jwt>"` in index-*.js,
 * url=true) maar de check zei anon_shape=false. Elke Pages-build na 9c45dafc
 * liep daarop stuk. We zoeken nu de echte sleutel, niet een minify-naam.
 *
 * Usage:
 *   node scripts/check-web-supabase-env.mjs
 *   node scripts/check-web-supabase-env.mjs --verify-bundle dist/public
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const VERBODEN_ROLLEN = new Set(['service_role', 'supabase_admin']);

export function loadEnvFiles(cwd = process.cwd(), envBron = process.env) {
  const env = { ...envBron };
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const pad = join(cwd, file);
    if (!existsSync(pad)) continue;
    for (const line of readFileSync(pad, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (env[key] == null || env[key] === '') env[key] = value;
    }
  }
  return env;
}

/**
 * Payload-rol van een JWT, of null als het geen drie-delige JSON-JWT is.
 * Print de token nooit: foutpaden geven alleen de rol-naam.
 */
export function jwtRol(token) {
  const delen = String(token || '').split('.');
  if (delen.length !== 3) return null;
  if (!delen[0].startsWith('eyJ') || !delen[1].startsWith('eyJ')) return null;
  try {
    const json = JSON.parse(Buffer.from(delen[1], 'base64url').toString('utf8'));
    return typeof json?.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

/**
 * Vite bakte de sleutel als één string, maar terser mag `"a"+"b"` splitsen.
 * We plakken die concatenaties eerst weer aan elkaar vóór we zoeken.
 */
export function bundelBevatSleutel(text, sleutel) {
  if (!sleutel) return false;
  if (text.includes(sleutel)) return true;
  return text.replace(/["']\s*\+\s*["']/g, '').includes(sleutel);
}

export function beoordeelEnv(env) {
  const missing = [];
  for (const key of REQUIRED) {
    const v = (env[key] ?? '').trim();
    if (!v) missing.push(key);
  }
  if (missing.length) {
    return {
      ok: false,
      error:
        'check-web-supabase-env: missing required public auth vars for build:web:\n  ' +
        missing.join('\n  ') +
        '\nSet them in the environment (or a supabase-only .env) before building. ' +
        'Do not bake desktop secrets into the web bundle.',
    };
  }
  const url = env.VITE_SUPABASE_URL.trim();
  const anon = env.VITE_SUPABASE_ANON_KEY.trim();
  if (!url.includes('supabase')) {
    return {
      ok: false,
      error: 'check-web-supabase-env: VITE_SUPABASE_URL does not look like a Supabase project URL',
    };
  }
  if (anon.length < 20) {
    return {
      ok: false,
      error: 'check-web-supabase-env: VITE_SUPABASE_ANON_KEY looks too short',
    };
  }
  const rol = jwtRol(anon);
  if (!rol) {
    return {
      ok: false,
      error: 'check-web-supabase-env: VITE_SUPABASE_ANON_KEY is not a JWT (expected a legacy anon token)',
    };
  }
  if (VERBODEN_ROLLEN.has(rol)) {
    return {
      ok: false,
      error:
        `check-web-supabase-env: VITE_SUPABASE_ANON_KEY is a ${rol} key — refusing to bake it into the web bundle`,
    };
  }
  if (rol !== 'anon') {
    return {
      ok: false,
      error: `check-web-supabase-env: VITE_SUPABASE_ANON_KEY has role ${rol}, expected anon`,
    };
  }
  return { ok: true, url, anon };
}

function* walk(root) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|html)$/.test(name)) yield path;
  }
}

export function beoordeelBundel(root, url, anon) {
  if (!existsSync(root)) {
    return {
      ok: false,
      foundUrl: false,
      foundAnonShape: false,
      error: `check-web-supabase-env: bundle root missing: ${root}`,
    };
  }
  const envCheck = beoordeelEnv({
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: anon,
  });
  if (!envCheck.ok) {
    return { ok: false, foundUrl: false, foundAnonShape: false, error: envCheck.error };
  }
  let foundUrl = false;
  let foundAnonShape = false;
  const needle = url.replace(/\/$/, '');
  for (const path of walk(root)) {
    const text = readFileSync(path, 'utf8');
    if (text.includes(needle)) foundUrl = true;
    if (bundelBevatSleutel(text, anon)) foundAnonShape = true;
  }
  if (!foundUrl || !foundAnonShape) {
    return {
      ok: false,
      foundUrl,
      foundAnonShape,
      error:
        'check-web-supabase-env: web bundle is missing Supabase auth config ' +
        `(url=${foundUrl}, anon_shape=${foundAnonShape}). ` +
        'Rebuild with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set; do not deploy an empty-auth bundle.',
    };
  }
  return { ok: true, foundUrl, foundAnonShape };
}

export function main(argv = process.argv.slice(2), envBron = process.env, cwd = process.cwd()) {
  const env = loadEnvFiles(cwd, envBron);
  const envCheck = beoordeelEnv(env);
  if (!envCheck.ok) {
    console.error(envCheck.error);
    return 1;
  }
  console.log('check-web-supabase-env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY present');
  const verifyIdx = argv.indexOf('--verify-bundle');
  if (verifyIdx === -1) {
    return 0;
  }
  const rootArg = argv[verifyIdx + 1] || 'dist/public';
  const root = rootArg.startsWith('/') ? rootArg : join(cwd, rootArg);
  const bundle = beoordeelBundel(root, envCheck.url, envCheck.anon);
  if (!bundle.ok) {
    console.error(bundle.error);
    return 1;
  }
  console.log('check-web-supabase-env: bundle contains Supabase URL + anon key shape');
  return 0;
}

const hier = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(hier).href) {
  process.exit(main());
}
