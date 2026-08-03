/**
 * Companion-parity chart desk for AXE CORE.
 * ChartCanvas + ChartIndicatorLayer (volumetric OB) + FibAnnotationLayer (draggable fib).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChartCanvas, type ChartCanvasHandle } from './ChartCanvas';
import { ChartIndicatorLayer } from './ChartIndicatorLayer';
import { FibAnnotationLayer } from './FibAnnotationLayer';
import type { ChartAnnotation, MetaApiCandle } from './types';
import { SMC_FLAG_KEYS, INDICATOR_FLAG_KEYS } from './indicatorMapping';
import { priceDigitsForSymbol } from './symbolFormat';
import type { ChartOverlayRow } from './brokerTypes';

export type CompanionChartDeskProps = {
  symbol: string;
  candles: MetaApiCandle[];
  height?: number;
  className?: string;
  overlays?: ChartOverlayRow[];
  drawingFib?: boolean;
  onDrawingFibChange?: (v: boolean) => void;
};

const DEFAULT_SMC: Record<string, boolean> = {
  structure: true,
  orderBlocks: true,
  fvg: true,
  ifvg: true,
  pdh: true,
  pdl: true,
  pdq: false,
  sessionOpen: false,
  swingPoints: false,
  supplyDemand: true,
};

const DEFAULT_IND: Record<string, boolean> = {
  volume: false,
  ma: true,
  macd: false,
  bollinger: false,
  rsi: false,
  vwap: false,
  poc: false,
};

export default function CompanionChartDesk({
  symbol,
  candles,
  height = 520,
  className,
  overlays = [],
  drawingFib: drawingFibProp,
  onDrawingFibChange,
}: CompanionChartDeskProps) {
  const canvasRef = useRef<ChartCanvasHandle | null>(null);
  const [smc, setSmc] = useState(DEFAULT_SMC);
  const [inds, setInds] = useState(DEFAULT_IND);
  const [orderBlockCount, setOrderBlockCount] = useState<1 | 2 | 3>(2);
  const [fvgCount, setFvgCount] = useState<1 | 2 | 3>(2);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [drawingFibLocal, setDrawingFibLocal] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(true);

  const drawingFib = drawingFibProp ?? drawingFibLocal;
  const setDrawingFib = (v: boolean) => {
    setDrawingFibLocal(v);
    onDrawingFibChange?.(v);
  };

  const digits = useMemo(() => priceDigitsForSymbol(symbol), [symbol]);

  useEffect(() => {
    try {
      const s = localStorage.getItem('axe.core.chart.smc');
      const i = localStorage.getItem('axe.core.chart.ind');
      if (s) setSmc(prev => ({ ...prev, ...JSON.parse(s) }));
      if (i) setInds(prev => ({ ...prev, ...JSON.parse(i) }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('axe.core.chart.smc', JSON.stringify(smc));
      localStorage.setItem('axe.core.chart.ind', JSON.stringify(inds));
    } catch { /* ignore */ }
  }, [smc, inds]);

  const toggleSmc = (key: string) => setSmc(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleInd = (key: string) => setInds(prev => ({ ...prev, [key]: !prev[key] }));

  const onPointClick = useCallback(
    (point: { time: number; price: number }) => {
      if (!drawingFib) return;
      setAnnotations(prev => {
        const draft = prev.find(a => a.id === 'draft-fib');
        const now = new Date().toISOString();
        if (!draft) {
          return [
            ...prev,
            {
              id: 'draft-fib',
              symbol,
              timeframe: 'live',
              type: 'fib_retracement' as const,
              points: [point],
              settings: { extendRight: true },
              createdAt: now,
              updatedAt: now,
            },
          ];
        }
        if (draft.points.length >= 2) {
          return prev.map(a =>
            a.id === 'draft-fib' ? { ...a, points: [point], updatedAt: now } : a,
          );
        }
        return prev.map(a =>
          a.id === 'draft-fib'
            ? {
                ...a,
                id: `fib-${Date.now()}`,
                points: [...a.points, point],
                updatedAt: now,
              }
            : a,
        );
      });
      setDrawingFib(false);
    },
    [drawingFib, symbol],
  );

  const onUpdateAnnotation = useCallback((ann: ChartAnnotation) => {
    setAnnotations(prev => prev.map(a => (a.id === ann.id ? ann : a)));
  }, []);

  const onRemoveAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, []);

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors"
      style={{
        background: active ? 'rgba(167,139,250,0.22)' : 'rgba(255,255,255,0.04)',
        color: active ? '#ddd6fe' : 'rgba(255,255,255,0.45)',
        border: active ? '1px solid rgba(167,139,250,0.45)' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        minHeight: 360,
        background: '#050505',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="flex flex-wrap items-center gap-1.5 px-2 py-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: '#a78bfa' }}>
          {symbol}
        </span>
        <button
          type="button"
          onClick={() => setToolbarOpen(v => !v)}
          className="text-[10px] px-2 py-0.5 rounded"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {toolbarOpen ? 'Hide tools' : 'Indicators'}
        </button>
        {chip(drawingFib, 'Fib ✎', () => setDrawingFib(!drawingFib))}
        {chip(!!smc.orderBlocks, 'OB', () => toggleSmc('orderBlocks'))}
        {chip(!!smc.fvg, 'FVG', () => toggleSmc('fvg'))}
        {chip(!!smc.ifvg, 'iFVG', () => toggleSmc('ifvg'))}
        {chip(!!smc.supplyDemand, 'S/D', () => toggleSmc('supplyDemand'))}
        {chip(!!smc.pdh, 'PDH', () => toggleSmc('pdh'))}
        {chip(!!smc.pdl, 'PDL', () => toggleSmc('pdl'))}
        {chip(!!inds.ma, 'MA', () => toggleInd('ma'))}
        {chip(!!inds.bollinger, 'BB', () => toggleInd('bollinger'))}
        {chip(!!inds.vwap, 'VWAP', () => toggleInd('vwap'))}
        <div className="flex-1" />
        {smc.orderBlocks && (
          <select
            value={orderBlockCount}
            onChange={e => setOrderBlockCount(Number(e.target.value) as 1 | 2 | 3)}
            className="text-[10px] rounded px-1 py-0.5 bg-transparent"
            style={{ color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.08)' }}
            title="Order block count"
          >
            <option value={1}>OB×1</option>
            <option value={2}>OB×2</option>
            <option value={3}>OB×3</option>
          </select>
        )}
      </div>

      {toolbarOpen && (
        <div
          className="flex flex-wrap gap-1 px-2 py-1 text-[9px]"
          style={{ color: 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          {SMC_FLAG_KEYS.map(k => chip(!!smc[k], k, () => toggleSmc(k)))}
          {INDICATOR_FLAG_KEYS.map(k => chip(!!inds[k], k, () => toggleInd(k)))}
          <span className="ml-2 self-center">Volumetric OB · draggable Fib · Companion parity</span>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <ChartCanvas
          ref={canvasRef}
          candles={candles}
          overlays={overlays}
          pendingOrders={[]}
          symbol={symbol}
          annotations={annotations}
          drawingMode={drawingFib ? 'fib_retracement' : null}
          onPointClick={onPointClick}
          themeKey="midnight"
          compactLayout
        />
        <ChartIndicatorLayer
          candles={candles}
          canvasRef={canvasRef}
          active={{
            ma: inds.ma,
            bollinger: inds.bollinger,
            vwap: inds.vwap,
            poc: inds.poc,
            structure: smc.structure,
            orderBlocks: smc.orderBlocks,
            fvg: smc.fvg,
            ifvg: smc.ifvg,
            pdh: smc.pdh,
            pdl: smc.pdl,
            pdq: smc.pdq,
            sessionOpen: smc.sessionOpen,
            swingPoints: smc.swingPoints,
            supplyDemand: smc.supplyDemand,
          }}
          orderBlockCount={orderBlockCount}
          fvgCount={fvgCount}
          isDark
        />
        <FibAnnotationLayer
          annotations={annotations}
          canvasRef={canvasRef}
          digits={digits}
          onUpdate={onUpdateAnnotation}
          onRemove={onRemoveAnnotation}
        />
      </div>
    </div>
  );
}

export function barsToMetaApiCandles(
  bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>,
): MetaApiCandle[] {
  return bars.map(b => ({
    time: new Date((b.time < 1e12 ? b.time * 1000 : b.time)).toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    tickVolume: b.volume,
    volume: b.volume,
  }));
}
