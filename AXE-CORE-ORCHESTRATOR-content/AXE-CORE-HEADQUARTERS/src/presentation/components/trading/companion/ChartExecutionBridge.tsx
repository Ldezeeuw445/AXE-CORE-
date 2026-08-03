/**
 * Review-only order ticket bridge — adapted from AXE Companion
 * (src/components/chart/ChartExecutionBridge.tsx). Same safety model: AXE
 * prepares a ticket, nothing is sent to a broker without explicit approval,
 * and "Send to broker" stays disabled unless the feature flag is on.
 * Next.js Link → onPrepareTicket callback; process.env → import.meta.env;
 * Companion's `tos-*` utility classes → AXE CORE's `var(--text-*)` tokens.
 */
import { useEffect, useState } from "react";
import { Activity, Lock, ShieldAlert, X } from "lucide-react";
import { formatBrokerPrice } from "./symbolFormat";

type Props = {
  symbol: string;
  brokerSymbol: string;
  timeframeLabel: string;
  lastPrice: number | null;
  defaultSide?: "buy" | "sell";
  defaultOrderType?: "market" | "limit" | "stop";
  defaultVolume?: string;
  entryPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  onClose: () => void;
  /** Called with the built plan text when the user wants to review the ticket in AXE chat. */
  onPrepareTicket?: (planText: string) => void;
};

const EXECUTION_FEATURE_FLAG = import.meta.env.VITE_ENABLE_EXECUTION_BRIDGE === "true";

/**
 * Compact execution bridge under the chart.
 *
 * Default state: review-only. AXE prepares an order *ticket* — nothing is sent
 * to a broker without explicit user approval. When VITE_ENABLE_EXECUTION_BRIDGE
 * is unset/false, the bridge stays in review-only mode and the "Send to broker"
 * action is permanently disabled.
 */
export function ChartExecutionBridge({
  symbol,
  brokerSymbol,
  timeframeLabel,
  lastPrice,
  defaultSide = "buy",
  defaultOrderType = "market",
  defaultVolume = "0.10",
  entryPrice,
  stopLossPrice,
  takeProfitPrice,
  onClose,
  onPrepareTicket,
}: Props) {
  const [side, setSide] = useState<"buy" | "sell">(defaultSide);
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">(defaultOrderType);
  const [volume, setVolume] = useState<string>(defaultVolume);
  const [entry, setEntry] = useState<string>((entryPrice ?? lastPrice) ? formatBrokerPrice(brokerSymbol, entryPrice ?? lastPrice) : "");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [risk, setRisk] = useState<string>("0.5");
  const [acknowledged, setAcknowledged] = useState<boolean>(false);
  const [approvalOpen, setApprovalOpen] = useState<boolean>(false);

  useEffect(() => {
    setSide(defaultSide);
  }, [defaultSide]);

  useEffect(() => {
    setOrderType(defaultOrderType);
  }, [defaultOrderType]);

  useEffect(() => {
    setVolume(defaultVolume);
  }, [defaultVolume]);

  useEffect(() => {
    const next = entryPrice ?? lastPrice;
    if (next != null && Number.isFinite(next)) setEntry(formatBrokerPrice(brokerSymbol, next));
  }, [brokerSymbol, entryPrice, lastPrice]);

  useEffect(() => {
    if (stopLossPrice != null && Number.isFinite(stopLossPrice)) setStopLoss(formatBrokerPrice(brokerSymbol, stopLossPrice));
  }, [brokerSymbol, stopLossPrice]);

  useEffect(() => {
    if (takeProfitPrice != null && Number.isFinite(takeProfitPrice)) setTakeProfit(formatBrokerPrice(brokerSymbol, takeProfitPrice));
  }, [brokerSymbol, takeProfitPrice]);

  const planText = buildPlanText({
    symbol,
    brokerSymbol,
    timeframeLabel,
    side,
    orderType,
    volume,
    entry,
    stopLoss,
    takeProfit,
    risk,
  });

  return (
    <section className="-mx-4 relative shrink-0 overflow-hidden border-b border-white/[0.08] bg-[#030508] md:mx-0 md:border-x">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.05] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-300/85" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-secondary)" }}>
            Execution bridge
          </p>
          <span className="rounded-full border border-amber-400/25 bg-amber-400/8 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-amber-200/95">
            Review-only
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide execution bridge"
          className="rounded-full border border-white/10 bg-white/[0.04] p-1 hover:bg-white/[0.08]"
          style={{ color: "var(--text-secondary)" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        <p className="rounded border border-amber-400/15 bg-amber-400/[0.04] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-amber-200/90">
          AXE can prepare an order ticket. Broker execution is{" "}
          <span className="font-semibold">disabled by default</span>. Nothing is sent until you
          explicitly approve, and only when this app build has the execution bridge feature flag
          enabled.
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`rounded border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
              side === "buy"
                ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-200/95"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
            style={side !== "buy" ? { color: "var(--text-secondary)" } : undefined}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`rounded border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
              side === "sell"
                ? "border-rose-400/40 bg-rose-400/12 text-rose-200/95"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
            style={side !== "sell" ? { color: "var(--text-secondary)" } : undefined}
          >
            Sell
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {(["market", "limit", "stop"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`rounded border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                orderType === t
                  ? "border-white/[0.12] bg-white/[0.05] text-white/90"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
              style={orderType !== t ? { color: "var(--text-secondary)" } : undefined}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Volume (lots)" value={volume} onChange={setVolume} placeholder="0.10" />
          <Field label="Risk %" value={risk} onChange={setRisk} placeholder="0.5" />
          <Field
            label={orderType === "market" ? "Entry (last)" : "Entry"}
            value={entry}
            onChange={setEntry}
            placeholder={lastPrice ? formatBrokerPrice(brokerSymbol, lastPrice) : "—"}
          />
          <Field label="Stop loss" value={stopLoss} onChange={setStopLoss} placeholder="—" />
          <Field
            label="Take profit"
            value={takeProfit}
            onChange={setTakeProfit}
            placeholder="—"
            wide
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.06] bg-[#0c0d0e] p-2 text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 rounded border-white/20"
          />
          <span>
            I understand AXE can prepare orders, but I must review and approve before anything is
            sent. AXE never auto-executes.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPrepareTicket?.(planText)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2.5 text-[11px] font-semibold text-white/90 hover:bg-white/[0.08]"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Prepare order ticket (review)
          </button>
          <button
            type="button"
            onClick={() => setApprovalOpen(true)}
            disabled={!acknowledged || !EXECUTION_FEATURE_FLAG}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/8 px-3 py-2.5 text-[11px] font-semibold text-rose-200/95 transition-colors hover:bg-rose-400/12 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Lock className="h-3.5 w-3.5" />
            Send to broker
          </button>
        </div>

        {!EXECUTION_FEATURE_FLAG ? (
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Broker execution is not enabled in this build. AXE can still prepare a complete review
            ticket and a structured trade plan via chat.
          </p>
        ) : null}
      </div>

      {approvalOpen ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0c0c0c]/90 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-400/25 bg-[#060c16] p-4">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Final approval</p>
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {EXECUTION_FEATURE_FLAG
                ? "Broker execution is currently behind a manual review-only stub. No live order will be placed."
                : "Execution is disabled in this build. The bridge stays review-only."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setApprovalOpen(false)}
                className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold hover:bg-white/[0.06]"
                style={{ color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setApprovalOpen(false)}
                disabled
                className="rounded-lg border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-[11px] font-semibold text-rose-200/85 opacity-55"
              >
                Send (disabled)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-white/10 bg-[#0c0d0e] px-2 py-1.5 font-mono text-[12px] outline-none focus:border-white/[0.15]"
        style={{ color: "var(--text-primary)" }}
      />
    </label>
  );
}

function buildPlanText(input: {
  symbol: string;
  brokerSymbol: string;
  timeframeLabel: string;
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop";
  volume: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  risk: string;
}): string {
  const lines = [
    `[AXE · order ticket review]`,
    `Symbol: ${input.symbol} (broker ${input.brokerSymbol})`,
    `Timeframe: ${input.timeframeLabel}`,
    `Side: ${input.side.toUpperCase()}`,
    `Type: ${input.orderType}`,
    `Volume: ${input.volume || "—"} lots`,
    `Risk: ${input.risk || "—"} %`,
    `Entry: ${input.entry || "—"}`,
    `Stop loss: ${input.stopLoss || "—"}`,
    `Take profit: ${input.takeProfit || "—"}`,
    "",
    "Review this ticket: validate structure, risk, RR, timing, and what evidence I want before pulling the trigger. Execution stays disabled until I explicitly approve later.",
  ];
  return lines.join("\n");
}
