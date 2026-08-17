/**
 * Polling-based replacement for AXE Companion's useLiveChart (Cloudflare
 * ChartLiveRoom WebSocket + SSE fallback — out of scope for AXE CORE).
 * Same handler/status contract as the Companion hook so the ported
 * ChartScreen wiring needs no changes beyond the import path: callers
 * pass onTick/onCandleUpdate/onPositions/onOrders and read back
 * { status, reason, lastUpdateAt }.
 *
 * Backed by AXE CORE's own MetaAPI gateway (metaApiService.ts /
 * metaApiMarketData.ts), polled on independent intervals instead of a
 * push stream.
 */
import { useEffect, useRef, useState } from "react";
import {
  metaApiGetPositions,
  metaApiGetOrders,
  metaApiGetSymbolPrice,
  toMt5Symbol,
} from "@/infrastructure/gateways/metaApiService";
import { metaApiGetHistoricalCandles } from "@/infrastructure/gateways/metaApiMarketData";
import type { ChartOverlayRow, PendingOrderOverlay, MetaApiCandle } from "./types";

export type LiveUiStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "stale"
  | "offline"
  | "failed";

export type LiveChartHandlers = {
  onTick?: (tick: { mid: number | null; bid: number | null; ask: number | null; time: string | null }) => void;
  onCandleUpdate?: (candle: MetaApiCandle) => void;
  onPositions?: (p: { total: number; onSymbol: ChartOverlayRow[] }) => void;
  onOrders?: (p: { total: number; onSymbol: PendingOrderOverlay[] }) => void;
};

type Args = LiveChartHandlers & {
  enabled: boolean;
  /** Symbol the UI shows (e.g. XAUUSD). */
  displaySymbol: string;
  /** Broker-resolved symbol (e.g. XAUUSDm). Falls back to toMt5Symbol(displaySymbol). */
  brokerSymbol?: string;
  /** tf key m5..d1 */
  timeframeKey: string;
  /** Poll intervals (ms) — sane defaults tuned for MetaAPI rate limits. */
  tickIntervalMs?: number;
  candleIntervalMs?: number;
  positionsIntervalMs?: number;
  ordersIntervalMs?: number;
};

function rawSide(type: unknown): string {
  const t = String(type ?? "").toUpperCase();
  if (t.includes("SELL")) return "sell";
  if (t.includes("BUY")) return "buy";
  return "buy";
}

function mapPosition(p: Record<string, unknown>): ChartOverlayRow {
  return {
    id: String(p.id ?? p.positionId ?? ""),
    side: rawSide(p.type),
    volume: Number(p.volume) || 0,
    entryPrice: typeof p.openPrice === "number" ? p.openPrice : null,
    stopLoss: typeof p.stopLoss === "number" ? p.stopLoss : null,
    takeProfit: typeof p.takeProfit === "number" ? p.takeProfit : null,
    profit: typeof p.profit === "number" ? p.profit : null,
    openTime: typeof p.time === "string" ? p.time : null,
    currentPrice: typeof p.currentPrice === "number" ? p.currentPrice : null,
  };
}

function mapOrder(o: Record<string, unknown>): PendingOrderOverlay {
  return {
    id: String(o.id ?? o.orderId ?? ""),
    symbol: String(o.symbol ?? ""),
    type: String(o.type ?? "").toLowerCase().replace("order_type_", ""),
    side: rawSide(o.type),
    volume: Number(o.volume) || 0,
    openPrice: Number(o.openPrice) || 0,
    currentPrice: typeof o.currentPrice === "number" ? o.currentPrice : null,
    stopLoss: typeof o.stopLoss === "number" ? o.stopLoss : null,
    takeProfit: typeof o.takeProfit === "number" ? o.takeProfit : null,
    openTime: typeof o.time === "string" ? o.time : null,
  };
}

/**
 * Poll MetaAPI for tick/candle/position/order updates and forward them to
 * the same handler shape the ported chart components expect.
 */
export function useLiveChartPolling({
  enabled,
  displaySymbol,
  brokerSymbol,
  timeframeKey,
  onTick,
  onCandleUpdate,
  onPositions,
  onOrders,
  // Four independent timers, each hitting MetaAPI directly with no shared
  // cache or backoff. At the old defaults (2.5s/5s/4s/6s) that's ~60
  // requests/minute from one mounted chart, all day, every open app
  // instance — confirmed live 2026-08-17 as the actual cause of MetaAPI's
  // own "The quota has been exceeded" error surfacing on Run agent (a
  // completely unrelated action; positions/orders happened to be the calls
  // that tipped it over). None of this needs sub-10s freshness for a
  // decision-support desk, so these are widened to roughly a third of the
  // previous call volume instead of building a shared cache layer.
  tickIntervalMs = 6000,
  candleIntervalMs = 10000,
  positionsIntervalMs = 15000,
  ordersIntervalMs = 15000,
}: Args) {
  const [status, setStatus] = useState<LiveUiStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);

  const handlersRef = useRef<LiveChartHandlers>({});
  useEffect(() => {
    handlersRef.current = { onTick, onCandleUpdate, onPositions, onOrders };
  }, [onTick, onCandleUpdate, onPositions, onOrders]);

  useEffect(() => {
    if (!enabled || !displaySymbol) {
      setStatus("idle");
      setReason(null);
      setLastUpdateAt(null);
      return;
    }

    let cancelled = false;
    const symbol = (brokerSymbol || toMt5Symbol(displaySymbol)).trim();
    let lastGoodAt = 0;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;

    setStatus("connecting");
    setReason(null);

    function markHealthy() {
      if (cancelled) return;
      lastGoodAt = Date.now();
      setLastUpdateAt(new Date(lastGoodAt).toISOString());
      setReason(null);
      setStatus("connected");
      if (staleTimer) clearTimeout(staleTimer);
      if (offlineTimer) clearTimeout(offlineTimer);
      staleTimer = setTimeout(() => {
        if (cancelled) return;
        if (Date.now() - lastGoodAt >= 20_000) {
          setReason("No update from MetaAPI for 20 seconds.");
          setStatus("stale");
        }
      }, 20_000);
      offlineTimer = setTimeout(() => {
        if (cancelled) return;
        if (Date.now() - lastGoodAt >= 60_000) {
          setReason("MetaAPI polling has not responded for 60 seconds.");
          setStatus("offline");
        }
      }, 60_000);
    }

    function markFailed(msg: string) {
      if (cancelled) return;
      setReason(msg);
      setStatus((prev) => (prev === "connected" || prev === "stale" ? "stale" : "failed"));
    }

    async function pollTick() {
      const res = await metaApiGetSymbolPrice(symbol);
      if (cancelled) return;
      if (res.ok) {
        const { bid, ask } = res.price;
        const mid = bid != null && ask != null ? (bid + ask) / 2 : (bid ?? ask ?? null);
        handlersRef.current.onTick?.({ mid, bid, ask, time: res.price.time });
        markHealthy();
      } else {
        markFailed(res.error);
      }
    }

    async function pollCandle() {
      const res = await metaApiGetHistoricalCandles({ symbol, timeframe: timeframeKey, limit: 2 });
      if (cancelled) return;
      if (res.ok && res.candles.length > 0) {
        const last = res.candles[res.candles.length - 1];
        handlersRef.current.onCandleUpdate?.(last);
        markHealthy();
      } else if (!res.ok) {
        markFailed(res.error);
      }
    }

    async function pollPositions() {
      const res = await metaApiGetPositions();
      if (cancelled) return;
      if (res.ok) {
        const onSymbol = (res.positions as Record<string, unknown>[])
          .filter((p) => String(p.symbol ?? "").toUpperCase() === symbol.toUpperCase())
          .map(mapPosition);
        handlersRef.current.onPositions?.({ total: res.positions.length, onSymbol });
      }
    }

    async function pollOrders() {
      const res = await metaApiGetOrders();
      if (cancelled) return;
      if (res.ok) {
        const all = (res.orders as Record<string, unknown>[]).map(mapOrder);
        const onSymbol = all.filter((o) => o.symbol.toUpperCase() === symbol.toUpperCase());
        handlersRef.current.onOrders?.({ total: all.length, onSymbol });
      }
    }

    void pollTick();
    void pollCandle();
    void pollPositions();
    void pollOrders();

    const tickTimer = setInterval(() => void pollTick(), tickIntervalMs);
    const candleTimer = setInterval(() => void pollCandle(), candleIntervalMs);
    const positionsTimer = setInterval(() => void pollPositions(), positionsIntervalMs);
    const ordersTimer = setInterval(() => void pollOrders(), ordersIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(tickTimer);
      clearInterval(candleTimer);
      clearInterval(positionsTimer);
      clearInterval(ordersTimer);
      if (staleTimer) clearTimeout(staleTimer);
      if (offlineTimer) clearTimeout(offlineTimer);
    };
  }, [enabled, displaySymbol, brokerSymbol, timeframeKey, tickIntervalMs, candleIntervalMs, positionsIntervalMs, ordersIntervalMs]);

  return { status, reason, lastUpdateAt };
}
