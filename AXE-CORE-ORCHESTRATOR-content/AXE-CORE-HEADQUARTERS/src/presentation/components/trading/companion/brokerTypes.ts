export type ChartOverlayRow = {
  id: string;
  side: string;
  volume: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number | null;
  openTime?: string | null;
  currentPrice?: number | null;
  symbol?: string;
};

export type PendingOrderOverlay = {
  id: string;
  symbol?: string;
  type?: string;
  side: string;
  volume: number;
  openPrice: number;
  currentPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openTime?: string | null;
};
