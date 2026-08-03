/** Companion-parity indicator overlay — volumetric OB, FVG, iFVG, PDH/PDL, S/D. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MetaApiCandle } from "./types";
import type { ChartCanvasHandle } from "./ChartCanvas";
import { bollingerBands, pointOfControl, sessionVwap, smaSeries, emaSeries, type IndicatorMathCandle } from "./indicatorMath";

const RR = 8; const LR = 8;

type Props = {
  candles: MetaApiCandle[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  active: Record<string, boolean | undefined>;
  orderBlockCount?: 1 | 2 | 3;
  inverseFvgCount?: 1 | 2 | 3;
  fvgCount?: 1 | 2 | 3;
  futureProjectionX?: number | null;
  maPeriod?: number;
  maType?: "sma" | "ema";
  isDark?: boolean;
};

type Zone = {
  x: number; y: number; width: number; height: number; extendX: number; midY: number;
  stroke: string; fill: string; direction: "up" | "down";
  volumeProfile?: { y: number; height: number; widthFraction: number }[];
  volumetric?: { total: number };
  label?: string;
};

type LevelLine = { y: number; stroke: string; label: string; labelSide: "left" | "right" };

function toMath(candles: MetaApiCandle[]): IndicatorMathCandle[] {
  return candles.map(c => ({
    time: Math.floor(Date.parse(c.time) / 1000),
    open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.tickVolume ?? c.volume ?? 0,
    tickVolume: c.tickVolume ?? c.volume ?? 0,
  })).filter(c => Number.isFinite(c.time));
}

function fmtVol(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return `${Math.round(v)}`;
}

function volBreakdown(candles: IndicatorMathCandle[], top: number, bottom: number) {
  let total = 0;
  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    if (mid >= bottom && mid <= top) total += c.volume ?? 1;
  }
  return total > 0 ? { total } : undefined;
}

function volProfile(candles: IndicatorMathCandle[], top: number, bottom: number, slices = 8) {
  const range = top - bottom;
  if (!(range > 0)) return [];
  const buckets = new Array(slices).fill(0);
  let max = 0;
  for (const c of candles) {
    const mid = (c.high + c.low) / 2;
    if (mid < bottom || mid > top) continue;
    const idx = Math.min(slices - 1, Math.max(0, Math.floor(((top - mid) / range) * slices)));
    buckets[idx] += c.volume ?? 1;
    max = Math.max(max, buckets[idx]);
  }
  if (max <= 0) return [];
  return buckets.map((v, i) => ({ yFrac: i / slices, widthFraction: 0.25 + 0.75 * (v / max) }));
}

export function ChartIndicatorLayer({
  candles, canvasRef, active,
  orderBlockCount = 2, inverseFvgCount = 2, fvgCount = 2,
  futureProjectionX = null, maPeriod = 20, maType = "sma",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.subscribeViewport) return;
    return canvas.subscribeViewport(() => setVersion(v => v + 1));
  }, [canvasRef, candles.length]);

  const geometry = useMemo(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 40 || candles.length < 5) return { zones: [] as Zone[], levels: [] as LevelLine[], maPath: "" };
    const math = toMath(candles);
    const zones: Zone[] = [];
    const levels: LevelLine[] = [];
    const priceY = (p: number) => canvas.priceToCoordinate(p);
    const timeX = (t: number) => canvas.timeToCoordinate(t);

    if (active.orderBlocks) {
      const obs: Zone[] = [];
      for (let i = 3; i < math.length - 1; i++) {
        const a = math[i - 1], b = math[i], c = math[i + 1];
        const push = (dir: "up" | "down", top: number, bottom: number) => {
          const y1 = priceY(top), y2 = priceY(bottom), x1 = timeX(a.time), x2 = timeX(b.time);
          if (y1 == null || y2 == null || x1 == null || x2 == null) return;
          const topPx = Math.min(y1, y2), h = Math.max(2, Math.abs(y2 - y1));
          const left = Math.min(x1, x2), w = Math.max(10, Math.abs(x2 - x1));
          const profile = volProfile(math.slice(Math.max(0, i - 8), i + 4), top, bottom);
          obs.push({
            x: left, y: topPx, width: w, height: h,
            extendX: futureProjectionX ?? size.w - RR, midY: topPx + h / 2,
            stroke: dir === "up" ? "rgba(56,189,248,0.95)" : "rgba(251,146,60,0.95)",
            fill: dir === "up" ? "rgba(56,189,248,0.16)" : "rgba(251,146,60,0.16)",
            direction: dir,
            volumetric: volBreakdown(math.slice(Math.max(0, i - 8), i + 4), top, bottom),
            volumeProfile: profile.map(p => ({ y: topPx + p.yFrac * h, height: h / Math.max(1, profile.length), widthFraction: p.widthFraction })),
            label: dir === "up" ? "OB↑" : "OB↓",
          });
        };
        if (a.close < a.open && c.close > c.open && c.close > a.high) push("up", a.high, a.low);
        if (a.close > a.open && c.close < c.open && c.close < a.low) push("down", a.high, a.low);
      }
      zones.push(...obs.filter(z => z.direction === "up").slice(-orderBlockCount), ...obs.filter(z => z.direction === "down").slice(-orderBlockCount));
    }

    if (active.fvg) {
      const fvgs: Zone[] = [];
      for (let i = 2; i < math.length; i++) {
        const a = math[i - 2], c = math[i];
        const add = (dir: "up" | "down", top: number, bottom: number) => {
          const y1 = priceY(top), y2 = priceY(bottom), x1 = timeX(a.time), x2 = timeX(c.time);
          if (y1 == null || y2 == null || x1 == null || x2 == null) return;
          const topPx = Math.min(y1, y2), h = Math.max(2, Math.abs(y2 - y1));
          const left = Math.min(x1, x2), w = Math.max(8, Math.abs(x2 - x1));
          fvgs.push({
            x: left, y: topPx, width: w, height: h, extendX: left + w + 40, midY: topPx + h / 2,
            stroke: dir === "up" ? "rgba(52,211,153,0.85)" : "rgba(248,113,113,0.85)",
            fill: dir === "up" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
            direction: dir, label: "FVG",
          });
        };
        if (c.low > a.high) add("up", c.low, a.high);
        if (c.high < a.low) add("down", a.low, c.high);
      }
      zones.push(...fvgs.filter(z => z.direction === "up").slice(-fvgCount), ...fvgs.filter(z => z.direction === "down").slice(-fvgCount));
    }

    if (active.ifvg) {
      const ifvgs: Zone[] = [];
      for (let i = 2; i < math.length - 2; i++) {
        const a = math[i - 2], c = math[i];
        let top: number | null = null, bottom: number | null = null, dir: "up" | "down" | null = null;
        if (c.low > a.high) { top = c.low; bottom = a.high; dir = "up"; }
        else if (c.high < a.low) { top = a.low; bottom = c.high; dir = "down"; }
        if (top == null || bottom == null || !dir) continue;
        const mid = (top + bottom) / 2;
        for (let j = i + 1; j < math.length; j++) {
          const br = math[j];
          if (!((dir === "up" && br.close < mid) || (dir === "down" && br.close > mid))) continue;
          const y1 = priceY(top), y2 = priceY(bottom), x1 = timeX(a.time), x2 = timeX(br.time);
          if (y1 == null || y2 == null || x1 == null || x2 == null) break;
          const topPx = Math.min(y1, y2), h = Math.max(2, Math.abs(y2 - y1));
          const left = Math.min(x1, x2), w = Math.max(8, Math.abs(x2 - x1));
          ifvgs.push({
            x: left, y: topPx, width: w, height: h, extendX: left + w + 30, midY: topPx + h / 2,
            stroke: dir === "up" ? "rgba(45,212,191,0.9)" : "rgba(251,113,133,0.9)",
            fill: dir === "up" ? "rgba(45,212,191,0.12)" : "rgba(251,113,133,0.12)",
            direction: dir === "up" ? "down" : "up", label: "iFVG",
          });
          break;
        }
      }
      zones.push(...ifvgs.filter(z => z.direction === "up").slice(-inverseFvgCount), ...ifvgs.filter(z => z.direction === "down").slice(-inverseFvgCount));
    }

    if ((active.pdh || active.pdl || active.pdq) && math.length > 30) {
      const slice = math.slice(-48, -24);
      if (slice.length > 4) {
        const hi = Math.max(...slice.map(c => c.high));
        const lo = Math.min(...slice.map(c => c.low));
        if (active.pdh) { const y = priceY(hi); if (y != null) levels.push({ y, stroke: "rgba(34,211,238,0.85)", label: "PDH", labelSide: "left" }); }
        if (active.pdl) { const y = priceY(lo); if (y != null) levels.push({ y, stroke: "rgba(244,63,94,0.85)", label: "PDL", labelSide: "left" }); }
        if (active.pdq) { const y = priceY((hi + lo) / 2); if (y != null) levels.push({ y, stroke: "rgba(167,139,250,0.7)", label: "PDQ", labelSide: "left" }); }
      }
    }

    if (active.supplyDemand && math.length > 20) {
      const slice = math.slice(-60);
      const hi = Math.max(...slice.map(c => c.high));
      const lo = Math.min(...slice.map(c => c.low));
      const range = hi - lo || 1;
      for (const b of [
        { top: hi, bot: hi - range * 0.25, stroke: "rgba(248,113,113,0.55)", fill: "rgba(248,113,113,0.06)", label: "SUPPLY" },
        { top: lo + range * 0.25, bot: lo, stroke: "rgba(52,211,153,0.55)", fill: "rgba(52,211,153,0.06)", label: "DEMAND" },
      ]) {
        const y1 = priceY(b.top), y2 = priceY(b.bot);
        if (y1 == null || y2 == null) continue;
        const topPx = Math.min(y1, y2), h = Math.abs(y2 - y1);
        zones.push({
          x: LR, y: topPx, width: size.w - LR - RR, height: h, extendX: size.w - RR, midY: topPx + h / 2,
          stroke: b.stroke, fill: b.fill, direction: b.label === "SUPPLY" ? "down" : "up", label: b.label,
        });
      }
    }

    let maPath = "";
    if (active.ma && math.length >= maPeriod) {
      const closes = math.map(c => c.close);
      const series = maType === "ema" ? emaSeries(closes, maPeriod) : smaSeries(closes, maPeriod);
      const parts: string[] = [];
      for (let i = 0; i < series.length; i++) {
        const v = series[i]; if (v == null) continue;
        const x = timeX(math[i].time), y = priceY(v);
        if (x == null || y == null) continue;
        parts.push(`${parts.length ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
      }
      maPath = parts.join(" ");
    }

    if (active.bollinger && math.length >= 20) {
      const bb = bollingerBands(math.map(c => c.close), 20, 2);
      const last = bb[bb.length - 1];
      if (last) {
        for (const [val, lab, col] of [[last.upper, "BB U", "rgba(148,163,184,0.55)"], [last.middle, "BB M", "rgba(148,163,184,0.4)"], [last.lower, "BB L", "rgba(148,163,184,0.55)"]] as const) {
          if (val == null) continue;
          const y = priceY(val);
          if (y != null) levels.push({ y, stroke: col, label: lab, labelSide: "right" });
        }
      }
    }

    if (active.vwap) {
      const last = [...sessionVwap(math)].reverse().find(v => v != null);
      if (last != null) { const y = priceY(last); if (y != null) levels.push({ y, stroke: "rgba(250,204,21,0.7)", label: "VWAP", labelSide: "right" }); }
    }

    if (active.poc) {
      const poc = pointOfControl(math);
      if (poc) { const y = priceY(poc.price); if (y != null) levels.push({ y, stroke: "rgba(244,114,182,0.75)", label: "POC", labelSide: "right" }); }
    }

    return { zones, levels, maPath };
  }, [candles, canvasRef, size, version, active, orderBlockCount, fvgCount, inverseFvgCount, futureProjectionX, maPeriod, maType]);

  const recentVol = candles.slice(-40).reduce((a, c) => a + (c.tickVolume ?? c.volume ?? 1), 0) || 1;

  if (size.w < 40) return <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden />;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-[20]" aria-hidden>
      <svg width={size.w} height={size.h} className="absolute inset-0 overflow-visible">
        {geometry.maPath && <path d={geometry.maPath} fill="none" stroke="rgba(56,189,248,0.75)" strokeWidth={1.25} />}
        {geometry.levels.map((lv, i) => (
          <g key={`lv-${i}`}>
            <line x1={LR} x2={size.w - RR} y1={lv.y} y2={lv.y} stroke={lv.stroke} strokeWidth={1} strokeDasharray={lv.label.startsWith("BB") ? "3 3" : undefined} />
            <text x={lv.labelSide === "left" ? LR + 4 : size.w - RR - 4} y={lv.y - 4} fill={lv.stroke} fontSize={10} fontWeight={600} textAnchor={lv.labelSide === "left" ? "start" : "end"}>{lv.label}</text>
          </g>
        ))}
        {geometry.zones.map((z, i) => {
          const isOb = z.label?.startsWith("OB");
          const isBand = z.label === "SUPPLY" || z.label === "DEMAND";
          return (
            <g key={`z-${i}`}>
              <rect x={z.x} y={z.y} width={isBand ? z.width : Math.max(z.width, z.extendX - z.x)} height={z.height} fill={z.fill} stroke={isBand ? "none" : z.stroke} strokeWidth={isOb ? 1.4 : 1} rx={isOb ? 4 : 2} />
              {isOb && z.volumeProfile?.map((bar, bi) => (
                <rect key={bi} x={z.x + 2} y={bar.y} width={Math.max(2, z.width * bar.widthFraction * 0.55)} height={Math.max(1, bar.height - 1)} fill={z.direction === "up" ? "rgba(56,189,248,0.22)" : "rgba(251,146,60,0.22)"} />
              ))}
              {isOb && z.volumetric && (
                <>
                  <line x1={z.x + z.width} y1={z.midY} x2={size.w - RR - 52} y2={z.midY} stroke={z.stroke} strokeWidth={1} strokeDasharray="3 3" />
                  <rect x={size.w - RR - 56} y={z.midY - 9} width={52} height={16} rx={3} fill="rgba(0,0,0,0.55)" />
                  <text x={size.w - RR - 30} y={z.midY + 3} fill={z.direction === "up" ? "#7dd3fc" : "#fdba74"} fontSize={10} fontWeight={600} textAnchor="middle">{fmtVol(z.volumetric.total)} ({Math.round((z.volumetric.total / recentVol) * 100)}%)</text>
                </>
              )}
              {z.label && <text x={z.x + 4} y={z.y + 11} fill={z.stroke} fontSize={9} fontWeight={700}>{z.label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default ChartIndicatorLayer;
