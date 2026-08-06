/**
 * AXE Companion's professional MT5 chart, assembled for AXE CORE's Trading
 * desk from the ported pieces in this folder. Companion's own ChartScreen.tsx
 * (5470 lines) is a single Next.js page component with this wiring inline —
 * there is no standalone file to port, so this assembly is fresh code that
 * wires the 1:1-ported building blocks (ChartCanvas, ChartIndicatorLayer,
 * IndicatorPane, ChartToolsDrawer, ChartQuickActions, ChartExecutionBridge,
 * ChartOrderConfirm, ChartPendingOrderSheet, PositionLabelsOverlay,
 * PositionSlTpLine) together with AXE CORE's own MetaAPI polling hook.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Palette, Sliders, Zap, Crosshair, Star } from "lucide-react";
import { toast } from "sonner";
import { ChartCanvas, type ChartCanvasHandle } from "./ChartCanvas";
import { ChartIndicatorLayer } from "./ChartIndicatorLayer";
import { IndicatorPane } from "./IndicatorPane";
import { ChartToolsDrawer, DEFAULT_CHART_TOOLS_STATE, type ChartToolsState } from "./ChartToolsDrawer";
import { ChartExecutionBar, type PendingDraft } from "./ChartExecutionBar";
import { ChartPendingOrderSheet } from "./ChartPendingOrderSheet";
import { Mt5SplitButton } from "./ChartQuickActions";
import { ChartExecutionBridge } from "./ChartExecutionBridge";
import { ChartOrderConfirm, type OrderConfirmInput, type OrderConfirmStatus } from "./ChartOrderConfirm";
import { PositionLabelsOverlay } from "./PositionLabelsOverlay";
import { PositionSlTpLine } from "./PositionSlTpLine";
import { getChartTheme, type ChartThemeKey } from "./chartTheme";
import { priceDigitsForSymbol } from "./symbolFormat";
import type { ChartOverlayRow, MetaApiCandle, PendingOrderOverlay } from "./types";
import { useLiveChartPolling } from "./useLiveChartPolling";
import { FibAnnotationLayer } from "./annotations/FibAnnotationLayer";
import type { AnnotationPoint, ChartAnnotation } from "./annotations/types";
import { appendAnnotation, loadAnnotations, removeAnnotation, saveAnnotations } from "./annotations/store";
import { metaApiGetHistoricalCandles } from "@/infrastructure/gateways/metaApiMarketData";
import { metaApiMarketOrder, toMt5Symbol } from "@/infrastructure/gateways/metaApiService";
import { brokerPlaceOrder } from "@/infrastructure/gateways/brokerConnector";
import { executeDemoTrade } from "@/infrastructure/persistence/demoTradingService";
import { detectAllSmc, type Bar } from "@/presentation/components/trading/smcDetect";
import { sma, rsi } from "@/infrastructure/gateways/marketDataService";
import type { IndicatorSnapshot } from "@/presentation/components/trading/CompanionStyleChart";

type Props = {
  symbol?: string;
  timeframe?: string;
  className?: string;
  onPrepareTicket?: (planText: string) => void;
  onIndicators?: (snap: IndicatorSnapshot) => void;
  /** Star button — opens the strategies/most-profitable-setups picker. */
  onOpenStrategies?: () => void;
};

const TFS = ["m5", "m15", "h1", "h4", "d1"] as const;
/** `null` = neither bar shown. Each toolbar button toggles its own bar on/off,
 *  matching MT5 (and Companion) rather than forcing one to always be visible. */
type ExecutionMode = "market" | "limit" | null;

export function CompanionChart({ symbol = "XAUUSD", timeframe = "h1", className, onPrepareTicket, onIndicators, onOpenStrategies }: Props) {
  const [tf, setTf] = useState<string>(timeframe);
  const [candles, setCandles] = useState<MetaApiCandle[]>([]);
  const [overlays, setOverlays] = useState<ChartOverlayRow[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderOverlay[]>([]);
  const [loadStatus, setLoadStatus] = useState("Loading…");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsState, setToolsState] = useState<ChartToolsState>(DEFAULT_CHART_TOOLS_STATE);
  const [themeKey, setThemeKey] = useState<ChartThemeKey>("midnight");
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [volume, setVolume] = useState("0.10");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("market");
  const [limitExpanded, setLimitExpanded] = useState(false);
  const [limitSide, setLimitSide] = useState<"buy" | "sell">("buy");
  const [limitType, setLimitType] = useState<"buy_limit" | "sell_limit" | "buy_stop" | "sell_stop">("buy_limit");
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [limitSl, setLimitSl] = useState<number | null>(null);
  const [limitTp, setLimitTp] = useState<number | null>(null);
  const [confirmInput, setConfirmInput] = useState<OrderConfirmInput | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<OrderConfirmStatus>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const drawingPointsRef = useRef<AnnotationPoint[]>([]);

  const canvasRef = useRef<ChartCanvasHandle | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const brokerSymbol = useMemo(() => toMt5Symbol(symbol), [symbol]);
  const digits = priceDigitsForSymbol(symbol);
  const theme = getChartTheme(themeKey);
  const isDark = themeKey !== "paper";

  const lastCandle = candles.length ? candles[candles.length - 1] : null;
  const [tick, setTick] = useState<{ mid: number | null; bid: number | null; ask: number | null }>({ mid: null, bid: null, ask: null });
  const lastPrice = tick.mid ?? lastCandle?.close ?? null;

  // Initial (and symbol/tf-change) candle load.
  useEffect(() => {
    let cancelled = false;
    setLoadStatus("Loading candles…");
    void (async () => {
      const res = await metaApiGetHistoricalCandles({ symbol, timeframe: tf, limit: 400 });
      if (cancelled) return;
      if (res.ok && res.candles.length) {
        setCandles(res.candles);
        setReloadKey((k) => k + 1);
        setLoadStatus(`${symbol} · ${tf} · ${res.candles.length} bars`);
      } else if (!res.ok) {
        setLoadStatus(`MetaAPI: ${res.error}`);
      } else {
        setLoadStatus("No candles — set MetaAPI token/account in Settings");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, tf]);

  const { status: liveStatus, reason: liveReason } = useLiveChartPolling({
    enabled: true,
    displaySymbol: symbol,
    brokerSymbol,
    timeframeKey: tf,
    onTick: (t) => {
      setTick({ mid: t.mid, bid: t.bid, ask: t.ask });
      if (t.mid != null) canvasRef.current?.applyTick(t.mid);
    },
    onCandleUpdate: (c) => {
      canvasRef.current?.updateLastCandle(c);
      setCandles((prev) => {
        if (!prev.length) return [c];
        const last = prev[prev.length - 1];
        if (last.time === c.time) return [...prev.slice(0, -1), c];
        return [...prev, c];
      });
    },
    onPositions: (p) => setOverlays(p.onSymbol),
    onOrders: (p) => setPendingOrders(p.onSymbol),
  });

  const bars: Bar[] = useMemo(
    () =>
      candles
        .map((c) => ({ time: Math.floor(Date.parse(c.time) / 1000), open: c.open, high: c.high, low: c.low, close: c.close }))
        .filter((b) => Number.isFinite(b.time) && b.time > 0)
        .sort((a, b) => a.time - b.time),
    [candles],
  );
  const smc = useMemo(() => detectAllSmc(bars), [bars]);
  useEffect(() => {
    if (!onIndicators || !bars.length) return;
    const ohlc = bars.map((b) => ({ t: b.time * 1000, o: b.open, h: b.high, l: b.low, c: b.close }));
    const closes = bars.map((b) => b.close);
    const last = closes[closes.length - 1] ?? 0;
    const sma20 = sma(ohlc, 20);
    const sma50 = sma(ohlc, 50);
    const rsi14 = rsi(ohlc, 14);
    const pdh = smc.zones.find((z) => z.kind === "pdh");
    const pdl = smc.zones.find((z) => z.kind === "pdl");
    const f382 = smc.fib.find((f) => f.label.includes("38.2"));
    const f618 = smc.fib.find((f) => f.label.includes("61.8"));
    onIndicators({
      symbol,
      timeframe: tf,
      last,
      sma20,
      sma50,
      rsi14,
      fvgCount: smc.zones.filter((z) => z.kind === "fvg").length,
      obCount: smc.zones.filter((z) => z.kind === "ob").length,
      pdh: pdh?.top ?? null,
      pdl: pdl?.top ?? null,
      fib382: f382?.price ?? null,
      fib618: f618?.price ?? null,
      bars: bars.length,
      lastVolume: candles[candles.length - 1]?.tickVolume ?? candles[candles.length - 1]?.volume ?? null,
    });
  }, [bars, smc, symbol, tf, onIndicators]);

  useEffect(() => {
    setAnnotations(loadAnnotations(symbol, tf));
    drawingPointsRef.current = [];
  }, [symbol, tf]);

  const updateAnnotation = useCallback(
    (updated: ChartAnnotation) => {
      setAnnotations((prev) => {
        const next = prev.map((a) => (a.id === updated.id ? updated : a));
        saveAnnotations(symbol, tf, next);
        return next;
      });
    },
    [symbol, tf],
  );

  const removeAnnotationById = useCallback(
    (id: string) => {
      setAnnotations(removeAnnotation(symbol, tf, id));
    },
    [symbol, tf],
  );

  const handlePointClick = useCallback(
    (pt: AnnotationPoint) => {
      const mode = toolsState.drawingMode;
      if (!mode) return;
      const needed = mode === "text" || mode === "horizontal_level" ? 1 : 2;
      const next = [...drawingPointsRef.current, pt];
      drawingPointsRef.current = next;
      if (next.length >= needed) {
        const annotation: ChartAnnotation = {
          id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          symbol,
          timeframe: tf,
          type: mode,
          points: mode === "text" || mode === "horizontal_level" ? [pt] : next.slice(-2),
          settings: mode === "text" ? { text: "Note" } : mode === "horizontal_level" ? { label: "Level" } : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setAnnotations(appendAnnotation(symbol, tf, annotation));
        drawingPointsRef.current = [];
        setToolsState((s) => ({ ...s, drawingMode: null }));
      }
    },
    [symbol, tf, toolsState.drawingMode],
  );

  const pending: PendingDraft | null = pendingOrders.length
    ? {
        type: pendingOrders[0].type as PendingDraft["type"],
        volume: String(pendingOrders[0].volume),
        price: pendingOrders[0].openPrice,
        stopLoss: pendingOrders[0].stopLoss,
        takeProfit: pendingOrders[0].takeProfit,
      }
    : null;

  const openTicket = useCallback(
    (side: "buy" | "sell") => {
      const vol = Number(volume);
      if (!Number.isFinite(vol) || vol <= 0) {
        toast.error("Invalid volume");
        return;
      }
      setConfirmInput({
        symbol,
        brokerSymbol,
        side,
        orderType: "market",
        volume: vol,
        digits,
        openPrice: null,
        livePrice: lastPrice,
        stopLoss: null,
        takeProfit: null,
        slippagePoints: 20,
        accountLabel: "MetaAPI demo",
      });
      setConfirmStatus({ kind: "idle" });
    },
    [volume, symbol, brokerSymbol, digits, lastPrice],
  );

  const openLimitTicket = useCallback(() => {
    const vol = Number(volume);
    if (!Number.isFinite(vol) || vol <= 0) {
      toast.error("Invalid volume");
      return;
    }
    if (limitPrice == null) {
      toast.error("Set an entry price first");
      return;
    }
    setConfirmInput({
      symbol,
      brokerSymbol,
      side: limitSide,
      orderType: limitType,
      volume: vol,
      digits,
      openPrice: limitPrice,
      livePrice: lastPrice,
      stopLoss: limitSl,
      takeProfit: limitTp,
      slippagePoints: 20,
      accountLabel: "MetaAPI demo",
    });
    setConfirmStatus({ kind: "idle" });
  }, [volume, symbol, brokerSymbol, digits, lastPrice, limitSide, limitType, limitPrice, limitSl, limitTp]);

  const confirmSend = useCallback(async () => {
    if (!confirmInput) return;
    if (confirmInput.orderType !== "market") {
      // Pending-order placement isn't wired to a broker yet — be honest about
      // it instead of silently pretending the order went out.
      setConfirmStatus({ kind: "error", message: "Pending order placement isn't wired to a broker yet — market orders only for now." });
      return;
    }
    setConfirmStatus({ kind: "sending" });
    setBusy(true);
    try {
      const broker = await brokerPlaceOrder({
        symbol,
        side: confirmInput.side,
        qty: confirmInput.volume,
        reason: "Manual desk execution",
        confidence: 1,
      });
      if (broker.ok) {
        setConfirmStatus({ kind: "ok", message: `Sent via ${broker.venue || "broker"} @ ${broker.price ?? "mkt"}` });
        toast.success(`${confirmInput.side.toUpperCase()} ${confirmInput.volume} ${symbol}`);
        setTimeout(() => setConfirmInput(null), 900);
        return;
      }
      const meta = await metaApiMarketOrder({ symbol, side: confirmInput.side, volume: confirmInput.volume });
      if (meta.ok) {
        setConfirmStatus({ kind: "ok", message: "Sent to MetaAPI" });
        toast.success(`${confirmInput.side.toUpperCase()} ${confirmInput.volume} ${symbol} via MetaAPI`);
        setTimeout(() => setConfirmInput(null), 900);
        return;
      }
      const price = lastPrice ?? 0;
      const paper = await executeDemoTrade({
        symbol,
        side: confirmInput.side,
        qty: confirmInput.volume,
        price,
        reason: "Manual desk (paper)",
        confidence: 1,
      });
      if ("error" in paper) {
        setConfirmStatus({ kind: "error", message: paper.error });
      } else {
        setConfirmStatus({ kind: "ok", message: `Paper fill @ ${price}` });
        toast.success(`${confirmInput.side.toUpperCase()} ${confirmInput.volume} ${symbol} (paper)`);
        setTimeout(() => setConfirmInput(null), 900);
      }
    } catch (e) {
      setConfirmStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [confirmInput, symbol, lastPrice]);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
      <div className="grid items-center gap-2 px-1" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
        {/* Left: symbol / price / live status */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold tracking-wide" style={{ color: "#F5F0E6" }}>{symbol}</span>
          <span className="text-[11px] font-mono-data" style={{ color: lastPrice ? "#F5F0E6" : "rgba(255,255,255,0.35)" }}>
            {lastPrice ? lastPrice.toFixed(digits) : "—"}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
            style={{
              color: liveStatus === "connected" ? "#34d399" : liveStatus === "stale" ? "#facc15" : "rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.04)",
            }}
            title={liveReason ?? undefined}
          >
            {liveStatus}
          </span>
        </div>

        {/* Center: the icon cluster — tools, theme, market/limit toggle, strategies, ticket */}
        <div className="flex items-center gap-1.5 justify-self-center">
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            title="Indicators & tools"
            className="flex items-center justify-center h-7 w-7 rounded-lg border"
            style={{
              borderColor: toolsOpen ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.1)",
              background: toolsOpen ? "rgba(34,211,238,0.1)" : "transparent",
              color: toolsOpen ? "#67e8f9" : "rgba(255,255,255,0.75)",
            }}
          >
            <Sliders className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setThemeKey((k) => (k === "midnight" ? "paper" : "midnight"))}
            title="Toggle theme — Midnight / Paper"
            className="flex items-center justify-center h-7 w-7 rounded-lg border"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" }}
          >
            <Palette className="h-3.5 w-3.5" />
          </button>

          {/* Market (Zap) / Limit-Stop (Crosshair) — Companion's teal|red split
              buttons, 1:1 from ChartQuickActions. Mutually exclusive: each
              swaps which execution bar sits at the bottom of the chart. */}
          <Mt5SplitButton
            size="h-7 w-7"
            icon={Zap}
            active={executionMode === "market"}
            onClick={() => setExecutionMode((m) => (m === "market" ? null : "market"))}
            label="1-Click Trade — market execution bar"
          />
          <Mt5SplitButton
            size="h-7 w-7"
            icon={Crosshair}
            active={executionMode === "limit"}
            onClick={() => setExecutionMode((m) => (m === "limit" ? null : "limit"))}
            label="Limit / Stop order bar"
          />

          <button
            type="button"
            onClick={() => onOpenStrategies?.()}
            title="Most-used & profitable strategies"
            className="flex items-center justify-center h-7 w-7 rounded-lg border"
            style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(250,204,21,0.85)" }}
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right: timeframe tabs + status */}
        <div className="flex items-center gap-1 justify-self-end min-w-0">
          <div className="flex gap-1">
            {TFS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTf(t)}
                className="px-2 py-0.5 rounded text-[10px] uppercase"
                style={{
                  color: tf === t ? "#F5F0E6" : "rgba(255,255,255,0.35)",
                  background: tf === t ? "rgba(255,255,255,0.1)" : "transparent",
                  border: `1px solid ${tf === t ? "rgba(255,255,255,0.18)" : "transparent"}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="text-[10px] ml-1 truncate" style={{ color: "rgba(255,255,255,0.28)" }}>{loadStatus}</span>
        </div>
      </div>

      {bridgeOpen ? (
        <ChartExecutionBridge
          symbol={symbol}
          brokerSymbol={brokerSymbol}
          timeframeLabel={tf}
          lastPrice={lastPrice}
          onClose={() => setBridgeOpen(false)}
          onPrepareTicket={onPrepareTicket}
        />
      ) : null}

      <div className="relative flex-1" style={{ minHeight: 420 }}>
        <ChartCanvas
          ref={canvasRef}
          candles={candles}
          reloadKey={reloadKey}
          overlays={overlays}
          pendingOrders={pendingOrders}
          symbol={symbol}
          themeKey={themeKey}
          drawingMode={toolsState.drawingMode}
          onPointClick={handlePointClick}
        />
        <ChartIndicatorLayer candles={candles} canvasRef={canvasRef} active={toolsState.active} isDark={isDark} />
        <div className="pointer-events-none absolute inset-0 z-[25]">
          <FibAnnotationLayer
            annotations={annotations}
            canvasRef={canvasRef}
            digits={digits}
            onUpdate={updateAnnotation}
            onRemove={removeAnnotationById}
            futureProjectionX={null}
            lastBarTimeSec={bars[bars.length - 1]?.time ?? null}
            prevBarTimeSec={bars[bars.length - 2]?.time ?? null}
            isDark={isDark}
          />
        </div>
        {toolsOpen ? (
          <div className="absolute left-1/2 top-2 -translate-x-1/2 z-[70]">
            <ChartToolsDrawer open={toolsOpen} onClose={() => setToolsOpen(false)} state={toolsState} onChange={setToolsState} />
          </div>
        ) : null}
        <PositionLabelsOverlay
          canvasRef={canvasRef}
          overlays={overlays}
          pendingOrders={pendingOrders}
          symbol={symbol}
          isDemoAccount
          isDark={isDark}
        />
        {overlays.map((p) =>
          p.stopLoss != null ? (
            <PositionSlTpLine
              key={`${p.id}-sl`}
              canvasRef={canvasRef}
              price={p.stopLoss}
              label="SL"
              color={theme.negativeText}
              digits={digits}
              symbol={symbol}
              entryPrice={p.entryPrice}
              volume={p.volume}
              side={p.side === "sell" ? "sell" : "buy"}
              disabled
              onChange={() => toast("Drag-to-modify SL/TP isn't wired to the broker yet.")}
            />
          ) : null,
        )}
        {overlays.map((p) =>
          p.takeProfit != null ? (
            <PositionSlTpLine
              key={`${p.id}-tp`}
              canvasRef={canvasRef}
              price={p.takeProfit}
              label="TP"
              color={theme.cyanAccent}
              digits={digits}
              symbol={symbol}
              entryPrice={p.entryPrice}
              volume={p.volume}
              side={p.side === "sell" ? "sell" : "buy"}
              disabled
              onChange={() => toast("Drag-to-modify SL/TP isn't wired to the broker yet.")}
            />
          ) : null,
        )}
      </div>

      {toolsState.panes.includes("vol") ? (
        <div style={{ height: 72 }}>
          <IndicatorPane mode="volume" candles={candles} canvasRef={canvasRef} isDark={isDark} />
        </div>
      ) : null}
      {toolsState.panes.includes("rsi") ? (
        <div style={{ height: 72 }}>
          <IndicatorPane mode="rsi" candles={candles} canvasRef={canvasRef} isDark={isDark} />
        </div>
      ) : null}
      {toolsState.panes.includes("macd") ? (
        <div style={{ height: 72 }}>
          <IndicatorPane mode="macd" candles={candles} canvasRef={canvasRef} isDark={isDark} />
        </div>
      ) : null}

      {executionMode === null ? null : executionMode === "market" ? (
        <ChartExecutionBar
          symbol={symbol}
          bid={tick.bid ?? lastPrice}
          ask={tick.ask ?? lastPrice}
          volume={volume}
          onVolumeChange={setVolume}
          onBuy={() => openTicket("buy")}
          onSell={() => openTicket("sell")}
          pending={pending}
        />
      ) : (
        <ChartPendingOrderSheet
          symbol={symbol}
          orderLabel={limitType.replace("_", " ").toUpperCase()}
          side={limitSide}
          volume={volume}
          price={limitPrice ?? lastPrice}
          stopLoss={limitSl}
          takeProfit={limitTp}
          expanded={limitExpanded}
          onToggleExpand={() => setLimitExpanded((v) => !v)}
          onSubmit={openLimitTicket}
          onOpenLot={() => setLimitExpanded(true)}
          onOpenType={() => {
            setLimitSide((s) => (s === "buy" ? "sell" : "buy"));
            setLimitType((t) => (t === "buy_limit" ? "sell_limit" : "buy_limit"));
          }}
          onToggleSl={() => setLimitSl((v) => (v == null ? (lastPrice ?? 0) * 0.99 : null))}
          onToggleTp={() => setLimitTp((v) => (v == null ? (lastPrice ?? 0) * 1.01 : null))}
          onPriceChange={setLimitPrice}
          onSlChange={setLimitSl}
          onTpChange={setLimitTp}
        />
      )}

      <ChartOrderConfirm
        open={!!confirmInput}
        input={confirmInput}
        status={confirmStatus}
        onCancel={() => {
          if (busy) return;
          setConfirmInput(null);
        }}
        onConfirm={() => void confirmSend()}
      />
    </div>
  );
}

export default CompanionChart;
