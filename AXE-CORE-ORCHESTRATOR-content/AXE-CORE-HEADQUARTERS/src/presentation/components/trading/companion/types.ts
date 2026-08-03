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

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
