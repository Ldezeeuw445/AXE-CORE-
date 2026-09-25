import { describe, expect, it } from 'vitest';
import { buildRealtimeScribeUrl } from '@/infrastructure/gateways/elevenRealtimeScribe';

describe('ElevenLabs realtime Scribe gateway', () => {
  it('builds a VAD websocket using a single-use token and PCM16 audio', () => {
    const url = new URL(buildRealtimeScribeUrl('sutkn_test_123'));

    expect(url.protocol).toBe('wss:');
    expect(url.host).toBe('api.elevenlabs.io');
    expect(url.pathname).toBe('/v1/speech-to-text/realtime');
    expect(url.searchParams.get('model_id')).toBe('scribe_v2_realtime');
    expect(url.searchParams.get('token')).toBe('sutkn_test_123');
    expect(url.searchParams.get('audio_format')).toBe('pcm_16000');
    expect(url.searchParams.get('commit_strategy')).toBe('vad');
    expect(url.searchParams.get('vad_silence_threshold_secs')).toBe('0.65');
    expect(url.searchParams.get('filter_background_audio')).toBe('true');
  });

  it('does not put an API key header/value into the websocket URL', () => {
    const url = buildRealtimeScribeUrl('sutkn_only_this');
    expect(url).not.toContain('xi-api-key');
    expect(url).not.toContain('VITE_ELEVENLABS_API_KEY');
  });
});
