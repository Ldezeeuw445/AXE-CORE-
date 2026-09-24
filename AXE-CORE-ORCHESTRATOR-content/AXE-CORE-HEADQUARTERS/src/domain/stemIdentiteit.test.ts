import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AXE_STEM_FALLBACK,
  AXE_STEM_ID,
  AXE_STEM_NAAM,
  STEM_UI,
  stemStandVanHealth,
} from '@/domain/stemIdentiteit';

const HQ = new URL('../..', import.meta.url).pathname;

describe('stemIdentiteit', () => {
  it('George is de enige AXE-stem; Cedar is alleen de fallback-naam', () => {
    expect(AXE_STEM_NAAM).toBe('George');
    expect(AXE_STEM_ID).toBe('bm_george');
    expect(AXE_STEM_FALLBACK).toBe('Cedar');
    expect(STEM_UI.uitleg).toMatch(/George/);
    expect(STEM_UI.uitleg).toMatch(/Cedar is only the fallback/);
    expect(STEM_UI.uitleg).not.toMatch(/OpenAI cedar/);
  });

  it('zet /health om in groen of rood met wat je eraan doet', () => {
    expect(stemStandVanHealth({ ok: true, voice: 'bm_george' })).toEqual({
      ok: true,
      regel: STEM_UI.live,
      watNu: null,
    });
    expect(stemStandVanHealth(null).ok).toBe(false);
    expect(stemStandVanHealth(null).regel).toBe(STEM_UI.dood);
    expect(stemStandVanHealth(null).watNu).toContain('install.sh');
    expect(stemStandVanHealth({ ok: true, voice: 'af_sarah' }).ok).toBe(false);
    expect(stemStandVanHealth({ ok: true, voice: 'af_sarah' }).regel).toContain('af_sarah');
    expect(stemStandVanHealth({ ok: false }, 'ECONNREFUSED').watNu).toContain('ECONNREFUSED');
  });

  it('app.py en de app noemen dezelfde stem', () => {
    const py = readFileSync(join(HQ, 'backend/axe_tts/app.py'), 'utf8');
    expect(py).toMatch(/DEFAULT_VOICE = "bm_george"/);
    expect(AXE_STEM_ID).toBe('bm_george');
  });
});

describe('aanroepketen: schermen lezen deze identiteit, niet een dode picker', () => {
  it('Settings VoiceSection noemt George via STEM_UI, niet OpenAI cedar', () => {
    const src = readFileSync(join(HQ, 'src/presentation/pages/SettingsPage.tsx'), 'utf8');
    const begin = src.indexOf('function VoiceSection');
    const eind = src.indexOf('function FishAudioSection');
    expect(begin).toBeGreaterThan(0);
    expect(eind).toBeGreaterThan(begin);
    const sectie = src.slice(begin, eind);
    expect(sectie).toContain('STEM_UI');
    expect(sectie).toContain('probeGeorgeStem');
    expect(sectie).toContain('STEM_MOTOREN');
    expect(sectie).toContain('zetStemMotor');
    expect(sectie).not.toMatch(/OpenAI <strong>cedar<\/strong>/);
    expect(sectie).not.toMatch(/OpenAI cedar — warm and natural/);
  });

  it('Sidebar Voice-rij polst George in plaats van axe_tts_provider/Fish', () => {
    const src = readFileSync(join(HQ, 'src/presentation/components/layout/Sidebar.tsx'), 'utf8');
    const begin = src.indexOf('function AICoreSystemLeft');
    const eind = src.indexOf('const OLLAMA_HEALTH_URL');
    expect(begin).toBeGreaterThan(0);
    expect(eind).toBeGreaterThan(begin);
    const fn = src.slice(begin, eind);
    expect(fn).toContain('probeGeorgeStem');
    expect(fn).not.toContain('axe_tts_provider');
    expect(fn).not.toContain('Fish Audio');
  });

  it('speakGlobal vraagt George eerst, Cedar alleen als George niets hoorbaars maakte', () => {
    const src = readFileSync(join(HQ, 'src/infrastructure/gateways/globalTts.ts'), 'utf8');
    expect(src).toContain('speakWithKokoro');
    expect(src).toContain('viaCedar');
    expect(src.indexOf('speakWithKokoro')).toBeLessThan(src.lastIndexOf('viaCedar'));
  });
});
