import { describe, it, expect } from 'vitest';
import { herstelModelNaam, isModelBestaatNiet } from './modelHerstel';

describe('een verkeerd opgeslagen model', () => {
  it('krijgt kleine letters bij providers waar ids altijd klein zijn', () => {
    expect(herstelModelNaam('anthropic', 'Claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(herstelModelNaam('gemini-free', ' Gemini-3.1-pro ')).toBe('gemini-3.1-pro');
  });
  it('blijft ongemoeid waar hoofdletters echt kunnen', () => {
    expect(herstelModelNaam('openrouter', 'Qwen/Qwen3')).toBe('Qwen/Qwen3');
    expect(herstelModelNaam('ollama', undefined)).toBeUndefined();
  });
  it('herkent "model bestaat niet" in de echte meldingen van 13 september', () => {
    expect(isModelBestaatNiet('model: Claude-sonnet-5')).toBe(true);
    expect(isModelBestaatNiet('models/gemini-3.1-pro is not found for API version v1beta')).toBe(true);
    expect(isModelBestaatNiet('* GenerateContentRequest.model: unexpected model name format')).toBe(true);
    expect(isModelBestaatNiet('cerebras HTTP 404')).toBe(true);
  });
  it('verwart een geweigerde sleutel of op tegoed niet met een ontbrekend model', () => {
    expect(isModelBestaatNiet('Incorrect API key provided')).toBe(false);
    expect(isModelBestaatNiet('This request requires more credits')).toBe(false);
  });
});
