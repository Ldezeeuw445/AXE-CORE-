/**
 * Primary one-tap execution bar (SELL price | qty stepper | BUY price),
 * with a pending-order sub-row (type · qty · price · SL/TP pills) when a
 * pending order is staged. This is the slim always-visible bar from AXE
 * Companion's chart bottom edge — that exact bar lives inline inside
 * Companion's ChartScreen.tsx (not a standalone file), so this is a fresh
 * implementation matching the same layout and behaviour, wired to
 * ChartExecutionBridge for the actual approval-gated send.
 */
import { formatBrokerPrice } from "./symbolFormat";

export type PendingDraft = {
  type: "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
  volume: string;
  price: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
};

type Props = {
  symbol: string;
  bid: number | null;
  ask: number | null;
  volume: string;
  onVolumeChange: (v: string) => void;
  onBuy: () => void;
  onSell: () => void;
  pending?: PendingDraft | null;
  onEditSl?: () => void;
  onEditTp?: () => void;
};

export function ChartExecutionBar({ symbol, bid, ask, volume, onVolumeChange, onBuy, onSell, pending, onEditSl, onEditTp }: Props) {
  const step = (dir: 1 | -1) => {
    const n = Math.max(0.01, (Number(volume) || 0) + dir * 0.01);
    onVolumeChange(n.toFixed(2));
  };

  return (
    <div className="shrink-0" style={{ background: "#000", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      {pending ? (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}>
          <span className="font-semibold uppercase tracking-wide" style={{ color: "#7dd3fc" }}>
            {pending.type.replace("_", " ")}
          </span>
          <span className="font-mono">{pending.volume}</span>
          <span className="font-mono">{formatBrokerPrice(symbol, pending.price)}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onEditSl}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}
          >
            SL {pending.stopLoss != null ? formatBrokerPrice(symbol, pending.stopLoss) : "—"}
          </button>
          <button
            type="button"
            onClick={onEditTp}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "rgba(34,211,238,0.15)", color: "#67e8f9" }}
          >
            TP {pending.takeProfit != null ? formatBrokerPrice(symbol, pending.takeProfit) : "—"}
          </button>
        </div>
      ) : null}

      <div className="flex items-stretch" style={{ height: 52 }}>
        <button
          type="button"
          onClick={onSell}
          disabled={bid == null}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 disabled:opacity-40"
          style={{ background: "#c0293a", color: "#fff" }}
        >
          <span className="text-[9px] font-semibold uppercase tracking-widest opacity-80">Sell</span>
          <span className="font-mono text-sm font-bold">{bid != null ? formatBrokerPrice(symbol, bid) : "—"}</span>
        </button>

        <div className="flex flex-col items-center justify-center gap-1 px-3" style={{ background: "#050505", minWidth: 96 }}>
          <button type="button" onClick={() => step(1)} aria-label="Increase volume" className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>▲</button>
          <span className="font-mono text-[13px] font-semibold" style={{ color: "#F5F0E6" }}>{volume}</span>
          <button type="button" onClick={() => step(-1)} aria-label="Decrease volume" className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>▼</button>
        </div>

        <button
          type="button"
          onClick={onBuy}
          disabled={ask == null}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 disabled:opacity-40"
          style={{ background: "#0f9db0", color: "#fff" }}
        >
          <span className="text-[9px] font-semibold uppercase tracking-widest opacity-80">Buy</span>
          <span className="font-mono text-sm font-bold">{ask != null ? formatBrokerPrice(symbol, ask) : "—"}</span>
        </button>
      </div>
    </div>
  );
}
