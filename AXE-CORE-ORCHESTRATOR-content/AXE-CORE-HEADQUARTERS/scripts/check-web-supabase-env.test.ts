import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  beoordeelBundel,
  beoordeelEnv,
  bundelBevatSleutel,
  jwtRol,
  main,
} from './check-web-supabase-env.mjs';

const tmpDirs: string[] = [];

function dummyJwt(role: 'anon' | 'service_role', length = 208): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'supabase',
      ref: 'localdummy000000',
      role,
      iat: 1_640_000_000,
      exp: 1_999_999_999,
    }),
  ).toString('base64url');
  const need = length - header.length - 1 - payload.length - 1;
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  if (need < 8) throw new Error(`dummy jwt cannot fit in ${length} chars`);
  const sig = alphabet.repeat(Math.ceil(need / alphabet.length)).slice(0, need);
  return `${header}.${payload}.${sig}`;
}

const URL = 'https://localdummy000000.supabase.co';
const ANON = dummyJwt('anon', 208);
const SERVICE = dummyJwt('service_role', 218);

function stubBundel(js: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'web-supa-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index-test.js'), js);
  return dir;
}

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* tmp */ }
  }
});

describe('check-web-supabase-env', () => {
  it('accepteert een 208-tekens legacy anon-JWT plus supabase-URL', () => {
    expect(ANON).toHaveLength(208);
    expect(jwtRol(ANON)).toBe('anon');
    const uit = beoordeelEnv({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON });
    expect(uit.ok).toBe(true);
  });

  it('faalt als de anon-sleutel ontbreekt', () => {
    const uit = beoordeelEnv({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: '' });
    expect(uit.ok).toBe(false);
    expect(uit.error).toMatch(/VITE_SUPABASE_ANON_KEY/);
    expect(uit.error).not.toMatch(ANON);
  });

  it('faalt als de URL ontbreekt', () => {
    const uit = beoordeelEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: ANON });
    expect(uit.ok).toBe(false);
    expect(uit.error).toMatch(/VITE_SUPABASE_URL/);
  });

  it('weigert een service_role-sleutel in de env — die hoort nooit in een webbundel', () => {
    expect(jwtRol(SERVICE)).toBe('service_role');
    const uit = beoordeelEnv({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: SERVICE });
    expect(uit.ok).toBe(false);
    expect(uit.error).toMatch(/service_role/);
    expect(uit.error).not.toContain(SERVICE);
  });

  it('vindt de sleutel zoals Vite hem nu inlinet (F0e="eyJ…", niet qye=)', () => {
    // 10 nov 2026: productie-minify noemt de binding F0e, niet qye. De oude
    // regex keek alleen naar qye= of een onmogelijk JWT-vorm, dus url=true
    // en anon_shape=false terwijl de sleutel er wél in stond.
    const js = `createClient("${URL}",F0e="${ANON}");`;
    expect(bundelBevatSleutel(js, ANON)).toBe(true);
    expect(/qye="eyJ[^"]{20,}"/.test(js)).toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{80,}\.[A-Za-z0-9_-]+\./.test(js)).toBe(false);
    const bundel = beoordeelBundel(stubBundel(js), URL, ANON);
    expect(bundel).toMatchObject({ ok: true, foundUrl: true, foundAnonShape: true });
  });

  it('vindt een sleutel die terser in "a"+"b" knipt', () => {
    const js = `k="${ANON.slice(0, 40)}"+ "${ANON.slice(40)}";u="${URL}"`;
    expect(js.includes(ANON)).toBe(false);
    expect(bundelBevatSleutel(js, ANON)).toBe(true);
    const bundel = beoordeelBundel(stubBundel(js), URL, ANON);
    expect(bundel.ok).toBe(true);
  });

  it('faalt op een bundel met URL maar zonder anon-sleutel (de Pages-fout)', () => {
    const bundel = beoordeelBundel(stubBundel(`u="${URL}";k=""`), URL, ANON);
    expect(bundel.ok).toBe(false);
    expect(bundel.foundUrl).toBe(true);
    expect(bundel.foundAnonShape).toBe(false);
    expect(bundel.error).toMatch(/url=true, anon_shape=false/);
  });

  it('weigert een service_role-sleutel ook als hij al in de bundel staat', () => {
    const bundel = beoordeelBundel(
      stubBundel(`createClient("${URL}","${SERVICE}")`),
      URL,
      SERVICE,
    );
    expect(bundel.ok).toBe(false);
    expect(bundel.error).toMatch(/service_role/);
  });

  it('main --verify-bundle slaagt op een vite-achtige dummy-bundel', () => {
    const logs: string[] = [];
    const errs: string[] = [];
    const ol = console.log;
    const oe = console.error;
    console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
    console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
    try {
      const dir = stubBundel(`createClient("${URL}",F0e="${ANON}")`);
      const code = main(
        ['--verify-bundle', dir],
        { VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON },
        dir,
      );
      expect(code).toBe(0);
      expect(logs.join('\n')).toMatch(/VITE_SUPABASE_URL \+ VITE_SUPABASE_ANON_KEY present/);
      expect(logs.join('\n')).toMatch(/bundle contains Supabase URL \+ anon key shape/);
      expect(errs.join('\n')).not.toContain(ANON);
    } finally {
      console.log = ol;
      console.error = oe;
    }
  });

  it('main faalt als de env-sleutel een service_role-JWT is', () => {
    const errs: string[] = [];
    const oe = console.error;
    console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
    try {
      const code = main([], { VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: SERVICE });
      expect(code).toBe(1);
      expect(errs.join('\n')).toMatch(/service_role/);
      expect(errs.join('\n')).not.toContain(SERVICE);
    } finally {
      console.error = oe;
    }
  });
});
