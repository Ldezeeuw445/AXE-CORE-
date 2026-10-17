import { describe, expect, it } from 'vitest';
import {
  clampAwayFromReserved,
  intersects,
  labelRect,
  resolveLabelCollisions,
} from './sceneLabels';

const VIEW = { w: 1440, h: 900 };
const COMPOSER = { x: 460, y: 720, w: 520, h: 72 };
const DOCK = { x: 200, y: 820, w: 1040, h: 56 };
const LEFT = { x: 0, y: 0, w: 240, h: 900 };
const RIGHT = { x: 1200, y: 0, w: 240, h: 900 };

describe('sceneLabels', () => {
  it('duwt een label vanonder de composer de vrije scene in', () => {
    const placed = clampAwayFromReserved(720, 750, 180, 28, VIEW, [COMPOSER, DOCK, LEFT, RIGHT]);
    expect(placed.hidden).toBe(false);
    expect(intersects(labelRect(placed.x, placed.y, 180, 28), COMPOSER)).toBe(false);
    expect(intersects(labelRect(placed.x, placed.y, 180, 28), DOCK)).toBe(false);
  });

  it('houdt labels uit de zijpanelen', () => {
    const placed = clampAwayFromReserved(80, 200, 160, 32, VIEW, [LEFT, RIGHT]);
    expect(placed.hidden).toBe(false);
    expect(placed.x).toBeGreaterThan(LEFT.w);
    expect(intersects(labelRect(placed.x, placed.y, 160, 32), LEFT)).toBe(false);
  });

  it('scheidt botsende labels en verbergt wat niet past', () => {
    const labels = [
      { id: 'hub', x: 720, y: 400, w: 140, h: 36, priority: 10 },
      { id: 'a', x: 720, y: 400, w: 200, h: 22, priority: 1 },
      { id: 'b', x: 720, y: 402, w: 200, h: 22, priority: 1 },
    ];
    const out = resolveLabelCollisions(labels, VIEW, [COMPOSER, DOCK, LEFT, RIGHT]);
    const hub = out.find((l) => l.id === 'hub')!;
    const a = out.find((l) => l.id === 'a')!;
    expect(hub.hidden).toBe(false);
    expect(a.hidden).toBe(false);
    expect(intersects(labelRect(hub.x, hub.y, 140, 36), labelRect(a.x, a.y, 200, 22))).toBe(false);
  });
});
