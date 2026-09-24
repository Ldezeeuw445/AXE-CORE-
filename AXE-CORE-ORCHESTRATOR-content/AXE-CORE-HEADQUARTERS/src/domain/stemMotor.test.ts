import { describe, expect, it } from 'vitest';
import { elevenLabsModelVan, parseStemMotor, STEM_MOTOREN } from './stemMotor';

describe('parseStemMotor', () => {
  it('George is de standaard, ook bij onzin', () => {
    expect(parseStemMotor(null)).toBe('george');
    expect(parseStemMotor('')).toBe('george');
    expect(parseStemMotor('openai')).toBe('george');
  });

  it('oude elevenlabs-waarde wordt Flash v2.5', () => {
    expect(parseStemMotor('elevenlabs')).toBe('elevenlabs-flash');
  });

  it('kent Flash, v3, Cartesia, Cedar, Fish', () => {
    expect(parseStemMotor('elevenlabs-flash')).toBe('elevenlabs-flash');
    expect(parseStemMotor('elevenlabs-v3')).toBe('elevenlabs-v3');
    expect(parseStemMotor('cartesia')).toBe('cartesia');
    expect(parseStemMotor('cedar')).toBe('cedar');
    expect(parseStemMotor('fish')).toBe('fish');
  });
});

describe('STEM_MOTOREN', () => {
  it('noemt Flash v2.5, v3 Conversational en Cartesia Sonic, zonder geheimen', () => {
    const ids = STEM_MOTOREN.map((m) => m.id);
    expect(ids).toEqual([
      'george',
      'cedar',
      'elevenlabs-flash',
      'elevenlabs-v3',
      'cartesia',
      'fish',
    ]);
    const tekst = JSON.stringify(STEM_MOTOREN);
    expect(tekst).toMatch(/eleven_flash_v2_5/);
    expect(tekst).toMatch(/eleven_v3_conversational/);
    expect(tekst).not.toMatch(/eleven_v3[^_]/);
    expect(tekst).toMatch(/sonic-3/);
    expect(tekst).not.toMatch(/sk_|xi-|cartesia_[a-z0-9]{8,}/i);
  });

  it('koppelt de motor aan het ElevenLabs-model', () => {
    expect(elevenLabsModelVan('elevenlabs-flash')).toBe('eleven_flash_v2_5');
    expect(elevenLabsModelVan('elevenlabs-v3')).toBe('eleven_v3_conversational');
    expect(elevenLabsModelVan('george')).toBe('eleven_flash_v2_5');
  });
});
