/**
 * Terrain engine for the volumetric memory terrain (pure math, no rendering).
 * Deterministic heightfield + color fields from a hub config.
 * Gold mesh caps appear ONLY on named (non-decorative) hubs.
 */
import * as THREE from 'three';

export const TERRAIN_GOLD = '#ffb733';

export interface TerrainHubConfig {
  id: string;
  name: string | null; // null => decorative rock mountain (no cap, no beacon)
  memories: number;
  color?: string;
  position: [number, number];
  height?: number;
  radius?: number;
  hideLabel?: boolean;
  source?: unknown; // original app object (BrainHub) for callbacks
}

export interface TerrainConfig {
  seed?: number;
  size?: number;
  baseHeight?: number;
  hubs: TerrainHubConfig[];
}

export interface EngineHub {
  id: string;
  name: string | null;
  decorative: boolean;
  memories: number;
  colorHex: string;
  color: THREE.Color;
  x: number;
  z: number;
  height: number;
  radius: number;
  hideLabel: boolean;
  source?: unknown;
}

export interface TerrainEngine {
  size: number;
  half: number;
  hubs: EngineHub[];
  heightAt: (x: number, z: number) => number;
  rockAt: (x: number, z: number, h: number, out: number[]) => void;
  capAt: (x: number, z: number, h: number, out: number[]) => number;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNoise2D(seed = 1) {
  const rand = mulberry32(seed * 9973 + 1);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grads = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const g = (hash: number, x: number, y: number) => {
    const gr = grads[hash & 7];
    return gr[0] * x + gr[1] * y;
  };
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    const n00 = g(perm[a], x, y);
    const n10 = g(perm[b], x - 1, y);
    const n01 = g(perm[a + 1], x, y - 1);
    const n11 = g(perm[b + 1], x - 1, y - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 1.4;
  };
}

export function buildTerrainEngine(config: TerrainConfig): TerrainEngine {
  const size = config.size ?? 64;
  const half = size / 2;
  const seed = config.seed ?? 7;
  const n1 = createNoise2D(seed);
  const n2 = createNoise2D(seed + 101);

  const fbm = (x: number, y: number, oct = 5) => {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n1(x * f, y * f);
      norm += a;
      a *= 0.5;
      f *= 2.02;
    }
    return s / norm;
  };

  const rfbm = (x: number, y: number, oct = 4) => {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      const v = 1 - Math.abs(n2(x * f, y * f));
      s += a * v * v;
      norm += a;
      a *= 0.5;
      f *= 2.13;
    }
    return s / norm;
  };

  const hubs: EngineHub[] = (config.hubs || []).map((h, i) => {
    const colorHex = h.color || TERRAIN_GOLD;
    return {
      id: h.id ?? `hub-${i}`,
      name: h.name ?? null,
      decorative: !h.name,
      memories: h.memories ?? 0,
      colorHex,
      color: new THREE.Color(colorHex),
      x: h.position?.[0] ?? 0,
      z: h.position?.[1] ?? 0,
      height: h.height ?? 2.5,
      radius: h.radius ?? 4.5,
      hideLabel: !!h.hideLabel,
      source: h.source,
    };
  });

  const baseAmp = config.baseHeight ?? 1.1;

  function heightAt(x: number, z: number): number {
    const b = fbm(x * 0.045, z * 0.045, 5);
    let h = baseAmp * Math.pow(THREE.MathUtils.clamp(b * 0.5 + 0.5, 0, 1), 1.25) * 2.1;
    h += 1.45 * Math.pow(rfbm(x * 0.055, z * 0.055, 4), 1.7);
    for (let i = 0; i < hubs.length; i++) {
      const hub = hubs[i];
      const dx = x - hub.x;
      const dz = z - hub.z;
      const d2 = dx * dx + dz * dz;
      const sig = hub.radius * 0.42;
      const w = Math.exp(-d2 / (2 * sig * sig));
      if (w > 0.002) {
        const detail = 0.6 + 0.7 * rfbm((x + hub.x) * 0.16, (z + hub.z) * 0.16, 3);
        h += hub.height * w * detail;
      }
    }
    return h;
  }

  function glowAt(x: number, z: number): { w: number; hub: EngineHub | null } {
    let wBest = 0;
    let best: EngineHub | null = null;
    for (let i = 0; i < hubs.length; i++) {
      const hub = hubs[i];
      if (hub.decorative) continue; // plain rock mountain - no glow cap
      const dx = x - hub.x;
      const dz = z - hub.z;
      const sig = hub.radius * 0.58;
      const w = Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig));
      if (w > wBest) {
        wBest = w;
        best = hub;
      }
    }
    return { w: wBest, hub: best };
  }

  const cTmp = new THREE.Color();
  const cWhite = new THREE.Color('#ffffff');
  const cRockLow = new THREE.Color('#0c121c');
  const cRockHigh = new THREE.Color('#4e5f7a');

  function rockAt(x: number, z: number, h: number, out: number[]) {
    const elev = THREE.MathUtils.clamp(h / 6.0, 0, 1);
    cTmp.copy(cRockLow).lerp(cRockHigh, Math.pow(elev, 1.35));
    const v = 0.78 + 0.38 * rfbm(x * 0.35, z * 0.35, 2);
    const ef = Math.max(Math.abs(x), Math.abs(z)) / half;
    const fade = THREE.MathUtils.smoothstep(ef, 0.85, 1.0);
    const b = v * (1 - fade * 0.85);
    out[0] = cTmp.r * b;
    out[1] = cTmp.g * b;
    out[2] = cTmp.b * b;
  }

  function capAt(x: number, z: number, h: number, out: number[]): number {
    const { w, hub } = glowAt(x, z);
    if (!hub || w < 0.03) {
      out[0] = out[1] = out[2] = 0;
      return 0;
    }
    const elev = THREE.MathUtils.clamp(h / 6.0, 0, 1);
    const intensity = Math.pow(w, 1.9) * (0.18 + 0.82 * Math.pow(elev, 1.7)) * 1.8;
    cTmp.copy(hub.color);
    const hot = Math.max(0, w - 0.72) * 2.4 * elev;
    if (hot > 0) cTmp.lerp(cWhite, Math.min(0.85, hot));
    cTmp.multiplyScalar(intensity);
    out[0] = cTmp.r;
    out[1] = cTmp.g;
    out[2] = cTmp.b;
    return Math.pow(w, 1.5) * elev;
  }

  return { size, half, hubs, heightAt, rockAt, capAt };
}

let glowTexCache: THREE.CanvasTexture | null = null;
export function makeGlowTexture(): THREE.CanvasTexture {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  glowTexCache = new THREE.CanvasTexture(c);
  return glowTexCache;
}
