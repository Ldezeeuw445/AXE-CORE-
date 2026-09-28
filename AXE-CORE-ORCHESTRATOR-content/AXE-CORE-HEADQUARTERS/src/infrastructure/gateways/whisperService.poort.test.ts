import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const bron = readFileSync(join(__dirname, 'whisperService.ts'), 'utf8');

describe('whisperService spraakpoort', () => {
  it('stuurt een opname alleen naar Whisper als er spraak is gemeten', () => {
    expect(bron).toContain('shouldTranscribeUtterance');
    expect(bron).toContain('hadSpeech');
    expect(bron).toContain('usableTranscript');
  });

  it('hervat de AudioContext (WKWebView start suspended)', () => {
    expect(bron).toContain('resumeContext');
    expect(bron).toContain('audioCtx.resume');
  });

  it('gooit een stille opname weg in plaats van hem te transcriberen', () => {
    expect(bron).toContain('discardOnStop');
    expect(bron).toContain('NO_SPEECH_MS');
  });
});
