/** Companion chart types — ported for AXE CORE trading desk. */

export type MetaApiCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  volume?: number;
  spread?: number;
};

export type ChartAnnotationType =
  | "fib_retracement"
  | "trendline"
  | "rectangle"
  | "text"
  | "horizontal_level"
  | "order_block"
  | "fvg";

export type AnnotationPoint = {
  /** Unix seconds (UTCTimestamp). */
  time: number;
  price: number;
};

export type ChartAnnotation = {
  id: string;
  userId?: string | null;
  accountId?: string | null;
  symbol: string;
  timeframe: string;
  type: ChartAnnotationType;
  points: AnnotationPoint[];
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Standard Fibonacci retracement levels (0 → 1 from anchor → swing). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** One open position, as the chart overlay needs it (subset of a broker position). */
export type ChartOverlayRow = {
  id: string;
  side: string;
  volume: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number | null;
  openTime: string | null;
  /** Live/last current price snapshot (broker). */
  currentPrice: number | null;
};

/** One pending (not-yet-filled) order, as the chart overlay needs it. */
export type PendingOrderOverlay = {
  id: string;
  symbol: string;
  /** e.g. "buy_limit", "sell_limit", "buy_stop", "sell_stop" */
  type: string;
  side: string;
  volume: number;
  /** Trigger price for the pending order. */
  openPrice: number;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  openTime: string | null;
};
