/**
 * Fib annotation layer — draggable handles for 0%/100% anchors.
 */
import { useEffect, useRef, useState } from "react";
import type { ChartCanvasHandle } from "./ChartCanvas";
import { FIB_LEVELS, type ChartAnnotation } from "./types";

const RIGHT_RAIL_OFFSET = 8;

type Props = {
  annotations: ChartAnnotation[];
  canvasRef: React.RefObject<ChartCanvasHandle | null>;
  digits: number;
  onUpdate: (annotation: ChartAnnotation) => void;
  onRemove?: (annotationId: string) => void;
  futureProjectionX?: number | null;
};

export function FibAnnotationLayer({
  annotations,
  canvasRef,
  digits,
  onUpdate,
  onRemove,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);
  const dragRef = useRef<{ id: string; which: 0 | 1 } | null>(null);

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
    return canvas.subscribeViewport(() => setTick((t) => t + 1));
  }, [canvasRef, annotations.length]);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const price = canvas.coordinateToPrice(y);
      if (price == null) return;
      const ann = annotations.find((a) => a.id === drag.id);
      if (!ann || ann.points.length < 2) return;
      const points = ann.points.map((p, i) =>
        i === drag.which ? { ...p, price } : p,
      );
      onUpdate({ ...ann, points, updatedAt: new Date().toISOString() });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [annotations, canvasRef, onUpdate]);

  const canvas = canvasRef.current;
  const fibs = annotations.filter((a) => a.type === "fib_retracement" && a.points.length >= 2);
  void tick;
  void digits;

  return (
    <div ref={hostRef} className="absolute inset-0 z-[22]" style={{ pointerEvents: "none" }}>
      <svg width={size.w} height={size.h} className="absolute inset-0 overflow-visible">
        {fibs.map((ann) => {
          if (!canvas || size.w < 40) return null;
          const p0 = ann.points[0];
          const p1 = ann.points[1];
          const hi = Math.max(p0.price, p1.price);
          const lo = Math.min(p0.price, p1.price);
          const yHi = canvas.priceToCoordinate(hi);
          const yLo = canvas.priceToCoordinate(lo);
          if (yHi == null || yLo == null) return null;
          const levels = FIB_LEVELS.map((r) => ({
            r,
            price: hi - (hi - lo) * r,
            y: canvas.priceToCoordinate(hi - (hi - lo) * r),
          }));
          return (
            <g key={ann.id}>
              {levels.map((lv) =>
                lv.y == null ? null : (
                  <g key={String(lv.r)}>
                    <line
                      x1={8}
                      x2={size.w - 56}
                      y1={lv.y}
                      y2={lv.y}
                      stroke={
                        lv.r === 0.618 || lv.r === 0.5 || lv.r === 0.382
                          ? "rgba(167,139,250,0.85)"
                          : "rgba(167,139,250,0.35)"
                      }
                      strokeWidth={lv.r === 0.618 || lv.r === 0.5 ? 1.25 : 0.8}
                      strokeDasharray={lv.r === 0.618 || lv.r === 0.5 || lv.r === 0.382 ? undefined : "2 3"}
                    />
                    <text
                      x={size.w - RIGHT_RAIL_OFFSET - 4}
                      y={(lv.y ?? 0) + 3}
                      fill="#c4b5fd"
                      fontSize={10}
                      fontWeight={lv.r === 0.618 ? 700 : 500}
                      textAnchor="end"
                    >
                      {(lv.r * 100).toFixed(lv.r === 0.5 ? 0 : 1)}%
                    </text>
                  </g>
                ),
              )}
              {[yHi, yLo].map((y, which) =>
                y == null ? null : (
                  <circle
                    key={which}
                    cx={size.w - 64}
                    cy={y}
                    r={7}
                    fill="#a78bfa"
                    stroke="#fff"
                    strokeWidth={1.5}
                    style={{ pointerEvents: "auto", cursor: "ns-resize" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      dragRef.current = { id: ann.id, which: which as 0 | 1 };
                    }}
                  />
                ),
              )}
              {onRemove && (
                <text
                  x={size.w - 80}
                  y={(yHi ?? 0) - 10}
                  fill="rgba(248,113,113,0.8)"
                  fontSize={10}
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onClick={() => onRemove(ann.id)}
                >
                  ✕
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default FibAnnotationLayer;
