import { useState } from "react";
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

const LOT_PRESETS = ["0.01", "0.05", "0.10", "0.25", "0.50", "1.00", "2.00", "5.00"];

export function ChartExecutionBar({ symbol, bid, ask, volume, onVolumeChange, onBuy, onSell, pending, onEditSl, onEditTp }: Props) {
  const [lotsOpen, setLotsOpen] = useState(false);
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
            style={{ background: "var(--tint)", color: "#67e8f9" }}
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
          {/* Tapping the number opens the presets. Stepping 0.01 at a time from
              0.01 to 1.00 is ninety-nine taps, which is why this existed in
              Companion and was missed the moment it was gone. */}
          <button
            type="button"
            onClick={() => setLotsOpen((v) => !v)}
            className="font-mono text-[13px] font-semibold"
            style={{ color: "#F5F0E6" }}
            aria-label="Choose lot size"
          >
            {volume}
          </button>
          <button type="button" onClick={() => step(-1)} aria-label="Decrease volume" className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>▼</button>
          {lotsOpen && (
            <>
              <button
                type="button"
                aria-label="Close lot sizes"
                className="fixed inset-0 z-[80] bg-transparent"
                onClick={() => setLotsOpen(false)}
              />
              <div
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[90] grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))] rounded-xl border p-1.5"
                style={{ background: "rgba(6,6,8,0.98)", borderColor: "rgba(255,255,255,0.12)", minWidth: 132 }}
              >
                {LOT_PRESETS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => { onVolumeChange(l); setLotsOpen(false); }}
                    className="rounded-lg px-2.5 py-1.5 font-mono text-[12px]"
                    style={{
                      color: l === volume ? "#0b0c0d" : "#F5F0E6",
                      background: l === volume ? "#22d3ee" : "rgba(255,255,255,0.05)",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}
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
