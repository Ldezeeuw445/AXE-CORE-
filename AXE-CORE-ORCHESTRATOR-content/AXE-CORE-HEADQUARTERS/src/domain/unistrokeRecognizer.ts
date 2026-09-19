/**
 * $1 unistroke-herkenner uit com.particlequickactions.UnistrokeRecognizer
 * (APK com.axecore.core 0.1.0-mvp).
 *
 * Lock-scherm opties: 64 samples, niet rotatie-invariant, pad ≥ 40,
 * minimumScore 0.85. Een slag telt alleen als duidelijke winnaar
 * (score ≥ 0.85 én ≥ 0.05 voorsprong op de runner-up).
 */
import type { GesturePoint, UnistrokeTemplate } from './gestureTemplates';

export type UnistrokeMatch = { name: string; score: number };
export type UnistrokeResult = { name: string; score: number; runnerUp: UnistrokeMatch | null };

export type UnistrokeOptions = {
  samples: number;
  rotationInvariant: boolean;
  minimumPathLength: number;
  minimumScore: number;
};

/** GestureLockScreen: Options(samples=64, rotationInvariant=false, minPath=40, minScore=0.85) */
export const LOCK_OPTIONS: UnistrokeOptions = {
  samples: 64,
  rotationInvariant: false,
  minimumPathLength: 40,
  minimumScore: 0.85,
};

const SQUARE_SIZE = 250;
const HALF_DIAGONAL = Math.sqrt(125000) * 0.5;
const ANGLE_RANGE = 0.7853981633974483;
const ANGLE_PRECISION = 0.03490658503988659;
const PHI = (Math.sqrt(5) - 1) * 0.5;
const CLEAR_WIN_GAP = 0.05;

function distance(a: GesturePoint, b: GesturePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function pathLength(points: GesturePoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

function resample(points: GesturePoint[], count: number): GesturePoint[] {
  if (count < 2 || points.length < 2) return points;
  const interval = pathLength(points) / (count - 1);
  if (interval <= 0) return points;
  const result: GesturePoint[] = [points[0]];
  const working = points.slice();
  let accumulated = 0;
  let i = 1;
  while (i < working.length) {
    const previous = working[i - 1];
    const current = working[i];
    const d = distance(previous, current);
    if (accumulated + d >= interval) {
      const t = (interval - accumulated) / d;
      const inserted = {
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t,
      };
      result.push(inserted);
      working.splice(i, 0, inserted);
      accumulated = 0;
    } else {
      accumulated += d;
    }
    i++;
  }
  const last = points[points.length - 1];
  while (result.length < count) result.push(last);
  return result.length > count ? result.slice(0, count) : result;
}

function centroid(points: GesturePoint[]): GesturePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function rotate(points: GesturePoint[], angle: number, c: GesturePoint): GesturePoint[] {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return points.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: (dx * cosA - dy * sinA) + c.x, y: (dx * sinA + dy * cosA) + c.y };
  });
}

function rotateToZero(points: GesturePoint[]): GesturePoint[] {
  const c = centroid(points);
  const first = points[0];
  if (!first) return points;
  const theta = Math.atan2(c.y - first.y, c.x - first.x);
  return rotate(points, -theta, c);
}

function scaleToSquare(points: GesturePoint[], size: number): GesturePoint[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(maxX - minX, 1e-4);
  const h = Math.max(maxY - minY, 1e-4);
  const s = Math.max(w, h);
  const sx = (Math.max(w / s, 0.12) * size) / w;
  const sy = (Math.max(h / s, 0.12) * size) / h;
  return points.map((p) => ({ x: (p.x - minX) * sx, y: (p.y - minY) * sy }));
}

function translateToOrigin(points: GesturePoint[]): GesturePoint[] {
  const c = centroid(points);
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function normalize(points: GesturePoint[], samples: number, rotationInvariant: boolean): GesturePoint[] | null {
  if (points.length < 2) return null;
  let p = resample(points, samples);
  if (p.length !== samples) return null;
  if (rotationInvariant) p = rotateToZero(p);
  return translateToOrigin(scaleToSquare(p, SQUARE_SIZE));
}

function pathDistance(a: GesturePoint[], b: GesturePoint[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Number.MAX_VALUE;
  let total = 0;
  for (let i = 0; i < n; i++) total += distance(a[i], b[i]);
  return total / n;
}

function distanceAtAngle(points: GesturePoint[], template: GesturePoint[], angle: number): number {
  return pathDistance(rotate(points, angle, centroid(points)), template);
}

function distanceAtBestAngle(points: GesturePoint[], template: GesturePoint[]): number {
  let a = -ANGLE_RANGE;
  let b = ANGLE_RANGE;
  let x1 = PHI * -ANGLE_RANGE + (1 - PHI) * ANGLE_RANGE;
  let f1 = distanceAtAngle(points, template, x1);
  let x2 = (1 - PHI) * -ANGLE_RANGE + PHI * ANGLE_RANGE;
  let f2 = distanceAtAngle(points, template, x2);
  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 >= f2) {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = distanceAtAngle(points, template, x2);
    } else {
      b = x2;
      x2 = x1;
      const f22 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = distanceAtAngle(points, template, x1);
      f2 = f22;
    }
  }
  return Math.min(f1, f2);
}

export class UnistrokeRecognizer {
  private normalized: Array<{ name: string; points: GesturePoint[] }> = [];
  constructor(
    templates: UnistrokeTemplate[],
    readonly options: UnistrokeOptions = LOCK_OPTIONS,
  ) {
    this.setTemplates(templates);
  }

  setTemplates(templates: UnistrokeTemplate[]): void {
    const out: Array<{ name: string; points: GesturePoint[] }> = [];
    for (const t of templates) {
      const n = normalize(t.points, this.options.samples, this.options.rotationInvariant);
      if (n) out.push({ name: t.name, points: n });
    }
    this.normalized = out;
  }

  recognize(points: GesturePoint[]): UnistrokeResult | null {
    if (points.length < 4 || pathLength(points) < this.options.minimumPathLength) return null;
    const candidate = normalize(points, this.options.samples, this.options.rotationInvariant);
    if (!candidate) return null;
    const ranked = this.rank(candidate);
    const top = ranked[0];
    if (top && top.score >= this.options.minimumScore) {
      return { name: top.name, score: top.score, runnerUp: ranked[1] ?? null };
    }
    return null;
  }

  private rank(candidate: GesturePoint[]): UnistrokeMatch[] {
    const best = new Map<string, number>();
    for (const t of this.normalized) {
      const dist = this.options.rotationInvariant
        ? distanceAtBestAngle(candidate, t.points)
        : pathDistance(candidate, t.points);
      const score = Math.max(0, 1 - dist / HALF_DIAGONAL);
      const current = best.get(t.name);
      if (current == null || score > current) best.set(t.name, score);
    }
    return [...best.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, score]) => ({ name, score }));
  }
}

/** GestureLockScreen: score ≥ 0.85 én ≥ 0.05 voorsprong. */
export function isClearWinner(result: UnistrokeResult | null): boolean {
  if (!result || result.score < 0.85) return false;
  if (!result.runnerUp) return true;
  return result.score - result.runnerUp.score >= CLEAR_WIN_GAP;
}
