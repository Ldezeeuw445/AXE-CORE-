import { describe, it, expect } from 'vitest';
import {
  isWhisperHallucination,
  normaliseerTranscript,
  shouldTranscribeUtterance,
  usableTranscript,
} from './whisperGuard';

describe('normaliseerTranscript', () => {
  it('stript leestekens en maakt kleine letters', () => {
    expect(normaliseerTranscript('You you.')).toBe('you you');
    expect(normaliseerTranscript('[Music]')).toBe('music');
  });
});

describe('isWhisperHallucination', () => {
  it('dropt de klassieke stilte-verzinsels', () => {
    for (const t of [
      'you',
      'You',
      'you you',
      'you you you',
      'You you.',
      'thank you',
      'Thank you.',
      'thanks',
      'thanks for watching',
      'Thanks for watching.',
      'thank you for watching',
      '.',
      '...',
      '…',
      '   ',
      '',
      '[music]',
      'please subscribe',
    ]) {
      expect(isWhisperHallucination(t), t).toBe(true);
    }
  });

  it('laat echte zinnen door, ook korte', () => {
    for (const t of ['Hey axe', 'yes', 'no', 'okay', 'stop', 'wat is de prijs', 'you there?']) {
      expect(isWhisperHallucination(t), t).toBe(false);
    }
  });
});

describe('shouldTranscribeUtterance', () => {
  it('weigert stilte ook als de blob groeit', () => {
    const blob = new Blob([new Uint8Array(4000)], { type: 'audio/webm' });
    expect(shouldTranscribeUtterance({ blob, hadSpeech: false })).toBe(false);
  });

  it('weigert een te kleine blob ook na spraak', () => {
    const blob = new Blob([new Uint8Array(20)], { type: 'audio/webm' });
    expect(shouldTranscribeUtterance({ blob, hadSpeech: true })).toBe(false);
    expect(shouldTranscribeUtterance({ blob, hadSpeech: true, minBytes: 10 })).toBe(true);
  });

  it('laat een echte utterance door', () => {
    const blob = new Blob([new Uint8Array(2000)], { type: 'audio/webm' });
    expect(shouldTranscribeUtterance({ blob, hadSpeech: true })).toBe(true);
  });

  it('weigert een ontbrekende blob', () => {
    expect(shouldTranscribeUtterance({ blob: null, hadSpeech: true })).toBe(false);
  });
});

describe('usableTranscript', () => {
  it('geeft echte tekst terug en leegt hallucinaties', () => {
    expect(usableTranscript('Hey axe')).toBe('Hey axe');
    expect(usableTranscript('you you')).toBe('');
    expect(usableTranscript('  ')).toBe('');
  });
});
