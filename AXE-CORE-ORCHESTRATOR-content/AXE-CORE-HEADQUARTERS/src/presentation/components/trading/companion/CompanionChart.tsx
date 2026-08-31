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
import { createPortal } from "react-dom";
import { Palette, Sliders, Zap, Crosshair, Star } from "lucide-react";
import { toast } from "sonner";
import { ChartCanvas, type ChartCanvasHandle } from "./ChartCanvas";
import { ChartIndicatorLayer } from "./ChartIndicatorLayer";
import { IndicatorPane } from "./IndicatorPane";
import { ChartToolsDrawer, DEFAULT_CHART_TOOLS_STATE, type ChartToolsState } from "./ChartToolsDrawer";
import { ResizablePane } from "./ResizablePane";
import { ChartExecutionBar, type PendingDraft } from "./ChartExecutionBar";
import { ChartPendingOrderSheet } from "./ChartPendingOrderSheet";
import { Mt5SplitButton } from "./ChartQuickActions";
import { ChartExecutionBridge } from "./ChartExecutionBridge";
import { ChartOrderConfirm, type OrderConfirmInput, type OrderConfirmStatus } from "./ChartOrderConfirm";
import { PositionLabelsOverlay } from "./PositionLabelsOverlay";
import { PositionSlTpLine } from "./PositionSlTpLine";
import { TradePlanLine } from "./TradePlanLine";
import { getChartTheme, type ChartThemeKey } from "./chartTheme";
import { priceDigitsForSymbol } from "./symbolFormat";
import type { ChartOverlayRow, MetaApiCandle, PendingOrderOverlay } from "./types";
import { useLiveChartPolling } from "./useLiveChartPolling";
import { FibAnnotationLayer } from "./annotations/FibAnnotationLayer";
import type { AnnotationPoint, ChartAnnotation } from "./annotations/types";
import { appendAnnotation, loadAnnotations, removeAnnotation, saveAnnotations } from "./annotations/store";
import { metaApiGetHistoricalCandles } from "@/infrastructure/gateways/metaApiMarketData";
import { metaApiMarketOrder, toMt5Symbol, type PendingOrderType } from "@/infrastructure/gateways/metaApiService";
import { brokerPlaceOrder, brokerPlacePendingOrder } from "@/infrastructure/gateways/brokerConnector";
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
const PAIRS = [
  "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD",
  "USDCAD", "BTCUSD", "ETHUSD", "US30", "US500", "NAS100", "GER40", "UK100", "WTIUSD",
] as const;
/** `null` = neither bar shown. Each toolbar button toggles its own bar on/off,
 *  matching MT5 (and Companion) rather than forcing one to always be visible. */
type ExecutionMode = "market" | "limit" | null;

export function CompanionChart({ symbol: initialSymbol = "XAUUSD", timeframe = "h1", className, onPrepareTicket, onIndicators, onOpenStrategies }: Props) {
  // Renaming the prop rather than threading a second variable through: every
  // existing `symbol` read -- broker symbol, digits, ticket, annotations, all
  // 38 of them -- then follows the picker. A chart showing one pair while the
  // buy button sends another is the one bug this component cannot have.
  const [symbol, setSymbol] = useState(initialSymbol);
  useEffect(() => { setSymbol(initialSymbol); }, [initialSymbol]);
  const [tf, setTf] = useState<string>(timeframe);
  const [candles, setCandles] = useState<MetaApiCandle[]>([]);
  const [overlays, setOverlays] = useState<ChartOverlayRow[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderOverlay[]>([]);
  const [loadStatus, setLoadStatus] = useState("Loading…");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  const [tfOpen, setTfOpen] = useState(false);
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
        // Bar count only. The pair and timeframe already have their own
        // controls directly above this line, so repeating them here
        // ("XAUUSD · H1 · 400 bars") duplicated what the pickers say and ate
        // width that a phone does not have.
        setLoadStatus(`${res.candles.length} bars`);
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
    setConfirmStatus({ kind: "sending" });
    setBusy(true);
    try {
      if (confirmInput.orderType !== "market") {
        if (confirmInput.openPrice == null) {
          setConfirmStatus({ kind: "error", message: "Missing entry price for pending order." });
          return;
        }
        const pending = await brokerPlacePendingOrder({
          symbol,
          type: confirmInput.orderType as PendingOrderType,
          qty: confirmInput.volume,
          openPrice: confirmInput.openPrice,
          stopLoss: confirmInput.stopLoss,
          takeProfit: confirmInput.takeProfit,
          slippagePoints: confirmInput.slippagePoints,
          reason: "Manual desk pending order",
          confidence: 1,
        });
        if (pending.ok) {
          setConfirmStatus({ kind: "ok", message: `Pending ${confirmInput.orderType} placed @ ${confirmInput.openPrice}` });
          toast.success(`${confirmInput.orderType.toUpperCase()} ${confirmInput.volume} ${symbol} @ ${confirmInput.openPrice}`);
          setTimeout(() => setConfirmInput(null), 900);
        } else {
          setConfirmStatus({ kind: "error", message: pending.error || "Pending order rejected" });
        }
        return;
      }
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
      {/* One row from md up, not lg.
        *
        * The breakpoint was lg (1024px). A Galaxy A17 held sideways is about
        * 832px of CSS width (2340px / 2.8125), so it fell under the threshold
        * and split into three stacked rows — symbol, icon cluster, timeframes —
        * on the one orientation where you are looking at candles and have the
        * least height to spare. md (768px) puts a landscape phone back on a
        * single row and gives that height to the chart.
        *
        * Portrait is roughly 384px and still stacks, which is correct: three
        * cells do not fit across a phone held upright. */}
      <div className="grid items-center gap-x-2 gap-y-1.5 px-1 grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_1fr]">
        {/* Left: symbol / price / live status */}
        <div className="relative flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setPairsOpen((v) => !v)}
            className="text-sm font-semibold tracking-wide flex items-center gap-1"
            style={{ color: "#F5F0E6" }}
            aria-label="Change pair"
          >
            {symbol}
            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>▾</span>
          </button>
          {pairsOpen ? (
            <>
              <button
                type="button"
                aria-label="Close pairs"
                className="fixed inset-0 z-[80] bg-transparent"
                onClick={() => setPairsOpen(false)}
              />
              <div
                className="absolute top-full left-0 mt-2 z-[90] grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] rounded-xl border p-1.5"
                style={{ background: "rgba(6,6,8,0.98)", borderColor: "rgba(255,255,255,0.12)", width: "min(300px,calc(100vw-32px))" }}
              >
                {PAIRS.map((pr) => (
                  <button
                    key={pr}
                    type="button"
                    onClick={() => { setSymbol(pr); setPairsOpen(false); }}
                    className="rounded-lg px-2 py-1.5 text-[11px]"
                    style={{
                      color: pr === symbol ? "#0b0c0d" : "#F5F0E6",
                      background: pr === symbol ? "#22d3ee" : "rgba(255,255,255,0.05)",
                    }}
                  >
                    {pr}
                  </button>
                ))}
              </div>
            </>
          ) : null}
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
        {/* On a phone this drops to its own full-width row BELOW the pair and
            timeframe (order-last + col-span-2), so the two things you change
            most sit together on the top line at the same height -- pair hard
            left, timeframe hard right -- instead of the timeframe being pushed
            under a row of icons. From md up nothing moves. */}
        <div className="flex items-center gap-1.5 flex-nowrap justify-self-center order-last col-span-2 md:order-none md:col-span-1 justify-center">
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            title="Indicators & tools"
            className="flex items-center justify-center h-7 w-7 rounded-lg border"
            style={{
              borderColor: toolsOpen ? "var(--tint-line)" : "rgba(255,255,255,0.1)",
              background: toolsOpen ? "var(--tint)" : "transparent",
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

        {/* Right: timeframe picker + status.
          *
          * Was a row of five always-visible buttons, which is the widest thing
          * in the header and the reason the row wrapped onto two lines on a
          * phone — pushing the chart down by a whole band. A dropdown costs one
          * tap and gives that height back to the candles, and it matches the
          * pair picker on the other side so the two things you switch most
          * behave the same way. */}
        <div className="flex items-center gap-2 justify-self-end min-w-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setTfOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] uppercase"
              style={{
                color: "#F5F0E6",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
              aria-label="Change timeframe"
            >
              {tf}
              <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>▾</span>
            </button>
            {tfOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close timeframes"
                  className="fixed inset-0 z-[80] bg-transparent"
                  onClick={() => setTfOpen(false)}
                />
                <div
                  className="absolute top-full right-0 mt-2 z-[90] flex flex-col gap-1 rounded-xl border p-1.5"
                  style={{ background: "rgba(6,6,8,0.98)", borderColor: "rgba(255,255,255,0.12)" }}
                >
                  {TFS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTf(t); setTfOpen(false); }}
                      className="rounded-lg px-3 py-1.5 text-[11px] uppercase text-left"
                      style={{
                        color: t === tf ? "#0b0c0d" : "#F5F0E6",
                        background: t === tf ? "#22d3ee" : "rgba(255,255,255,0.05)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <span className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.28)" }}>{loadStatus}</span>
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

      {/* min-h in a class, not inline: a hard 420px floor meant flex-1 could
          never shrink on a 716px phone, so the execution bar was pushed off the
          bottom of a container that does not scroll. The chart now gives way. */}
      <div className="relative flex-1 min-h-[200px] lg:min-h-[420px]">
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
        {/* Rendered into <body>, not here.
            
            The history in this one spot tells the story: absolute was clipped
            away by the chart column, so it became fixed; then it fought the
            nav's z-index. Both were treated as stacking problems and neither
            was. `position: fixed` is only relative to the viewport while no
            ancestor has a transform, filter or perspective — one of those in
            the chart's own layout turns it into an ordinary absolute box
            measured from that ancestor, which puts a bottom sheet somewhere
            off screen while the button that opened it stays lit.

            Reported 2026-08-19: the Sliders button showed active and no drawer
            appeared, so OB / FVG / IFVG / PDH / PDL / Fib were all unreachable
            even though every one of them is wired to ChartIndicatorLayer above.

            A portal to document.body has no ancestors to be trapped by. It is
            the only version of this that cannot be re-broken by a layout change
            somewhere up the tree. */}
        {toolsOpen
          ? createPortal(
              /* Bottom sheet on a phone, floating panel from sm up.
                  Anchored at top-14 it opened directly under the Android
                  shell's own native top bar -- which this web build cannot see,
                  because the shell draws it -- so on a 384px screen the drawer
                  was there and behind something, which reads as broken.
                  Anchoring to the bottom removes the guess entirely: nothing
                  above can cover it, and it lands where a thumb already is.
                  The transform is applied only from sm up, so it never becomes
                  a containing block on the phone path. */
              <div className="fixed z-[70] inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-14 sm:-translate-x-1/2">
                <ChartToolsDrawer open={toolsOpen} onClose={() => setToolsOpen(false)} state={toolsState} onChange={setToolsState} />
              </div>,
              document.body,
            )
          : null}
        {/* The limit order you are placing, while you are placing it.
          *
          * These lines existed only under `confirmInput` — the confirmation
          * sheet — so setting a price in the limit bar drew nothing at all on
          * the chart, and by the time a line appeared the decision was already
          * made. Reported 2026-08-19: "de limit bar geeft geen lijnen op de
          * chart als je een limit wilt zetten".
          *
          * And they are draggable, which is the other half of the same ask.
          * TradePlanLine has had a full pointer-drag engine the whole time; the
          * confirm-stage copies below pass `disabled` with a no-op onChange, so
          * nothing could move. Here the setters go straight back into the limit
          * sheet's own state, so dragging a line and typing a price are the
          * same edit — grab it and move it, the way MT5 does.
          */}
        {executionMode === "limit" ? (
          <>
            <TradePlanLine
              canvasRef={canvasRef}
              price={limitPrice ?? lastPrice}
              label={limitType.replace("_", " ").toUpperCase()}
              color={theme.cyanAccent}
              digits={digits}
              symbol={symbol}
              volume={String(volume)}
              side={limitSide}
              onChange={setLimitPrice}
            />
            {limitSl != null ? (
              <TradePlanLine
                canvasRef={canvasRef}
                price={limitSl}
                label="SL"
                color={theme.negativeText}
                digits={digits}
                symbol={symbol}
                dashed
                entryPrice={limitPrice ?? lastPrice}
                volume={String(volume)}
                side={limitSide}
                onChange={setLimitSl}
              />
            ) : null}
            {limitTp != null ? (
              <TradePlanLine
                canvasRef={canvasRef}
                price={limitTp}
                label="TP"
                color={theme.positiveText}
                digits={digits}
                symbol={symbol}
                dashed
                entryPrice={limitPrice ?? lastPrice}
                volume={String(volume)}
                side={limitSide}
                onChange={setLimitTp}
              />
            ) : null}
          </>
        ) : null}

        {/* The trade you are composing, drawn before it exists. TradePlanLine
            was written for exactly this and never imported, so a ticket showed
            its SL and TP as numbers in a sheet with nothing on the chart. */}
        {confirmInput ? (
          <>
            {confirmInput.orderType !== "market" && confirmInput.openPrice != null ? (
              <TradePlanLine
                canvasRef={canvasRef}
                price={confirmInput.openPrice}
                label="ENTRY"
                color={theme.cyanAccent}
                digits={digits}
                symbol={symbol}
                dashed
                volume={String(confirmInput.volume)}
                side={confirmInput.side}
                disabled
                onChange={() => {}}
              />
            ) : null}
            {confirmInput.stopLoss != null ? (
              <TradePlanLine
                canvasRef={canvasRef}
                price={confirmInput.stopLoss}
                label="SL"
                color={theme.negativeText}
                digits={digits}
                symbol={symbol}
                dashed
                entryPrice={confirmInput.openPrice ?? confirmInput.livePrice}
                volume={String(confirmInput.volume)}
                side={confirmInput.side}
                disabled
                onChange={() => {}}
              />
            ) : null}
            {confirmInput.takeProfit != null ? (
              <TradePlanLine
                canvasRef={canvasRef}
                price={confirmInput.takeProfit}
                label="TP"
                color={theme.positiveText}
                digits={digits}
                symbol={symbol}
                dashed
                entryPrice={confirmInput.openPrice ?? confirmInput.livePrice}
                volume={String(confirmInput.volume)}
                side={confirmInput.side}
                disabled
                onChange={() => {}}
              />
            ) : null}
          </>
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
        <ResizablePane id="vol">
          <IndicatorPane mode="volume" candles={candles} canvasRef={canvasRef} isDark={isDark} />
        </ResizablePane>
      ) : null}
      {toolsState.panes.includes("rsi") ? (
        <ResizablePane id="rsi">
          <IndicatorPane mode="rsi" candles={candles} canvasRef={canvasRef} isDark={isDark} />
        </ResizablePane>
      ) : null}
      {toolsState.panes.includes("macd") ? (
        <ResizablePane id="macd">
          <IndicatorPane mode="macd" candles={candles} canvasRef={canvasRef} isDark={isDark} />
        </ResizablePane>
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
          /* The sheet has a swipe-down-to-dismiss handle that calls onDismiss.
             Nothing ever passed one, so the gesture was inert — the grab bar
             moved under your finger and then the panel stayed exactly where it
             was. Closing it here also puts executionMode back to null, which is
             the same state the header's Crosshair toggle reads, so the two
             controls can no longer disagree about whether the sheet is open. */
          onDismiss={() => setExecutionMode(null)}
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
