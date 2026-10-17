/**
 * Labels in de vrije scene — nooit onder composer, dock of zijpanelen.
 *
 * De 3D-views plakten HTML-labels op geprojecteerde knopen. Na een hubklik
 * lagen 'AUDJPY — strategy scorec…' en 'NATGAS…' over de composer, de
 * dieptebalk en het dock. Dit bestand rekent de vrije rechthoek uit en
 * duwt labels daarheen, of verbergt ze als er geen plek is.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneLabel {
  id: string;
  /** Geprojecteerd anker (midden van de knoop). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hoger = mag blijven staan als het botst. Hubs > herinneringen. */
  priority: number;
}

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  hidden: boolean;
}

export const SCENE_RESERVE_ATTR = 'data-scene-reserve';

/** Selectors for chrome that already exists and must stay clear of labels. */
export const SCENE_RESERVE_SELECTORS = [
  `[${SCENE_RESERVE_ATTR}]`,
  '.nm-composer',
  '#composer',
  '.axe-memdock',
  '[data-axe-doel="memory-dock"]',
  '.nm-sidebar',
  '.sidebar',
  '.axe-hubdetail',
  '.nm-back-btn',
  '#back-btn',
  '.axe-memory-legend',
  '.axe-memory-agents',
] as const;

export function inflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function labelRect(x: number, y: number, w: number, h: number): Rect {
  return { x: x - w / 2, y: y - h / 2, w, h };
}

function pushOutOf(
  box: Rect,
  wall: Rect,
  viewport: { w: number; h: number },
): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const candidates = [
    { x: wall.x - box.w / 2, y: cy },
    { x: wall.x + wall.w + box.w / 2, y: cy },
    { x: cx, y: wall.y - box.h / 2 },
    { x: cx, y: wall.y + wall.h + box.h / 2 },
  ];
  const inside = candidates.filter((c) => (
    c.x - box.w / 2 >= 0 && c.x + box.w / 2 <= viewport.w
    && c.y - box.h / 2 >= 0 && c.y + box.h / 2 <= viewport.h
  ));
  const pool = inside.length ? inside : candidates;
  return pool.reduce((best, c) => {
    const d = Math.hypot(c.x - cx, c.y - cy);
    const bd = Math.hypot(best.x - cx, best.y - cy);
    return d < bd ? c : best;
  });
}

function clampIntoViewport(
  x: number,
  y: number,
  w: number,
  h: number,
  viewport: { w: number; h: number },
  margin = 8,
): { x: number; y: number } {
  const halfW = w / 2;
  const halfH = h / 2;
  return {
    x: Math.min(viewport.w - halfW - margin, Math.max(halfW + margin, x)),
    y: Math.min(viewport.h - halfH - margin, Math.max(halfH + margin, y)),
  };
}

/**
 * Duwt één label uit alle reserved rects. Verbergt het als het na een paar
 * duwen nog steeds overlapt — liever weg dan over de composer.
 */
export function clampAwayFromReserved(
  x: number,
  y: number,
  w: number,
  h: number,
  viewport: { w: number; h: number },
  reserved: Rect[],
): { x: number; y: number; hidden: boolean } {
  let px = x;
  let py = y;
  const walls = reserved.map((r) => inflate(r, 6));
  for (let i = 0; i < 6; i++) {
    const next = clampIntoViewport(px, py, w, h, viewport);
    px = next.x;
    py = next.y;
    const box = labelRect(px, py, w, h);
    const hit = walls.find((wall) => intersects(box, wall));
    if (!hit) return { x: px, y: py, hidden: false };
    const pushed = pushOutOf(box, hit, viewport);
    px = pushed.x;
    py = pushed.y;
  }
  const last = labelRect(px, py, w, h);
  const stillHits = walls.some((wall) => intersects(last, wall));
  return { x: px, y: py, hidden: stillHits };
}

export function resolveLabelCollisions(
  labels: SceneLabel[],
  viewport: { w: number; h: number },
  reserved: Rect[],
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const occupied: Rect[] = reserved.map((r) => inflate(r, 6));
  const ordered = [...labels].sort((a, b) => b.priority - a.priority);

  for (const label of ordered) {
    let { x, y, hidden } = clampAwayFromReserved(
      label.x, label.y, label.w, label.h, viewport, occupied,
    );
    if (!hidden) {
      for (let step = 0; step < 8; step++) {
        const box = labelRect(x, y, label.w, label.h);
        const bump = occupied.find((o) => intersects(box, o));
        if (!bump) break;
        y = bump.y + bump.h + label.h / 2 + 4;
        const again = clampAwayFromReserved(x, y, label.w, label.h, viewport, reserved);
        x = again.x;
        y = again.y;
        hidden = again.hidden;
        if (hidden) break;
      }
    }
    const box = labelRect(x, y, label.w, label.h);
    const stillHits = occupied.some((o) => intersects(box, o));
    if (stillHits) hidden = true;
    if (!hidden) occupied.push(inflate(box, 3));
    placed.push({ id: label.id, x, y, hidden });
  }
  return placed;
}

/** True when a "reserved" box is actually the whole scene (broken chrome). */
function isFullBleedChrome(r: Rect, viewport: { w: number; h: number }): boolean {
  return r.w > viewport.w * 0.42 && r.h > viewport.h * 0.55;
}

export function measureReservedIn(
  root: ParentNode,
  viewport: { left: number; top: number; w: number; h: number },
): Rect[] {
  const seen = new Set<Element>();
  const out: Rect[] = [];
  for (const sel of SCENE_RESERVE_SELECTORS) {
    root.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (!(el instanceof HTMLElement)) return;
      if (el.offsetParent === null && getComputedStyle(el).position === 'static') return;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (isFullBleedChrome({ x: 0, y: 0, w: r.width, h: r.height }, viewport)) return;
      out.push({
        x: r.left - viewport.left,
        y: r.top - viewport.top,
        w: r.width,
        h: r.height,
      });
    });
  }
  return out;
}
