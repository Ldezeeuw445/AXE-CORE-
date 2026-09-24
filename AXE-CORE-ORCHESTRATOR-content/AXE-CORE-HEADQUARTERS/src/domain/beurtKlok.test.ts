import { describe, it, expect } from 'vitest';
import { beurtRegel, leesBeurt, markBeurt, startBeurt } from './beurtKlok';

describe('beurtKlok', () => {
  it('meet first-token en first-audio vanaf t0, stt komt van Whisper', () => {
    startBeurt({ sttMs: 180, t0: 1000 });
    markBeurt('route', 8);
    markBeurt('firstToken', 220);
    markBeurt('firstAudio', 890);
    expect(leesBeurt()).toEqual({ sttMs: 180, routeMs: 8, firstTokenMs: 220, firstAudioMs: 890 });
    expect(beurtRegel()).toBe('lat · stt 180ms · route 8ms · token 220ms · audio 890ms');
  });

  it('schrijft firstAudio maar één keer', () => {
    startBeurt({ sttMs: 0, t0: 0 });
    markBeurt('firstAudio');
    const eerste = leesBeurt().firstAudioMs;
    markBeurt('firstAudio');
    expect(leesBeurt().firstAudioMs).toBe(eerste);
  });
});
