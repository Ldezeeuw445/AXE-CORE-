import { describe, it, expect } from 'vitest';
import { DIGIT_TEMPLATES, SHAPE_TEMPLATES, lockAlphabet } from './gestureTemplates';
import { UnistrokeRecognizer, isClearWinner, LOCK_OPTIONS } from './unistrokeRecognizer';

function jitter(points: { x: number; y: number }[], amp = 1.2) {
  return points.map((p, i) => ({
    x: p.x + Math.sin(i * 1.7) * amp,
    y: p.y + Math.cos(i * 1.3) * amp,
  }));
}

describe('unistroke lock alphabet', () => {
  it('sluit circle uit van het lock-alfabet', () => {
    expect(lockAlphabet().some((t) => t.name === 'circle')).toBe(false);
    expect(SHAPE_TEMPLATES.some((t) => t.name === 'circle')).toBe(true);
    expect(DIGIT_TEMPLATES.map((t) => t.name).join('')).toBe('0123456789');
  });

  it('herkent eigen templates als duidelijke winnaar', () => {
    const rec = new UnistrokeRecognizer(lockAlphabet(), LOCK_OPTIONS);
    for (const t of ['1', '7', 'triangle', 'swipeRight', 'check', 'square']) {
      const tpl = lockAlphabet().find((x) => x.name === t)!;
      const result = rec.recognize(jitter(tpl.points, 0.8));
      expect(isClearWinner(result), t).toBe(true);
      expect(result?.name).toBe(t);
    }
  });

  it('wijst te korte slagen af', () => {
    const rec = new UnistrokeRecognizer(lockAlphabet());
    expect(rec.recognize([{ x: 0, y: 0 }, { x: 2, y: 1 }])).toBeNull();
  });
});
