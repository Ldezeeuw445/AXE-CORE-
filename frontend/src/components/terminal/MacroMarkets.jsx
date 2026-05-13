import React, { useMemo } from "react";
import { Panel, Badge } from "../axe/Panel";
import { TrendingDown, TrendingUp } from "lucide-react";

function fmtUsd(v) {
  if (v == null) return "—";
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(2)}M`;
  if (v >= 1000) return `$${v.toLocaleString(undefined,{maximumFractionDigits:0})}`;
  return `$${Number(v).toFixed(v < 1 ? 4 : 2)}`;
}
function fmtChange(v) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function MacroMarkets({ snapshot }) {
  const crypto = snapshot?.sources?.crypto?.items || [];
  const macro = snapshot?.sources?.macro?.items || [];

  const fxRows = macro.filter((x) => x.source === "frankfurter");
  const idxRows = macro.filter((x) => x.source === "worldbank");

  const topCrypto = crypto.slice(0, 8);

  return (
    <Panel title="Macro + Markets" right={<Badge tone="cyan">LIVE</Badge>} dataTestId="macro-markets">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Indexes / FRED-style */}
        <div className="col-span-2">
          <div className="axe-section-label mb-2">INDEXES / MACRO</div>
          <ul className="grid grid-cols-2 gap-2">
            {idxRows.map((r) => (
              <li key={r.id} className="px-2 py-1.5 bg-white/3 border border-white/8 rounded-md flex items-center justify-between" data-testid={`macro-${r.id}`}>
                <span className="text-[10px] uppercase tracking-[0.06em] text-[#9FB0C0]">{r.title}</span>
                <span className="axe-num text-[11px] font-semibold text-[#EAF2F7]">
                  {r.unit === "USD" ? fmtUsd(r.value) : `${(r.value ?? 0).toFixed(2)}${r.unit === "%" ? "%" : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {/* FX */}
        <div className="col-span-2">
          <div className="axe-section-label mb-2">FX (USD vs)</div>
          <ul className="grid grid-cols-2 gap-2">
            {fxRows.map((r) => (
              <li key={r.id} className="px-2 py-1.5 bg-white/3 border border-white/8 rounded-md flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.06em] text-[#9FB0C0]">{r.title}</span>
                <span className="axe-num text-[11px] font-semibold text-[#EAF2F7]">{r.value?.toFixed?.(4)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3">
        <div className="axe-section-label mb-2 flex items-center justify-between">
          <span>CRYPTO TOP 8</span><span className="text-[9px] text-[#6F8193]">CoinGecko</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {topCrypto.map((c) => {
            const pos = (c.change_24h_pct ?? 0) >= 0;
            return (
              <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 bg-white/3 border border-white/8 rounded-md" data-testid={`crypto-${c.symbol}`}>
                {c.image && <img src={c.image} alt="" width="14" height="14" className="opacity-90" />}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-[#9FB0C0] flex items-center justify-between">
                    <span>{c.symbol}</span>
                    <span className={`flex items-center gap-0.5 ${pos ? "text-[#2EF2C2]" : "text-[#FF4D6D]"}`}>
                      {pos ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                      {fmtChange(c.change_24h_pct)}
                    </span>
                  </div>
                  <div className="axe-num text-[11px] text-[#EAF2F7] font-semibold">{fmtUsd(c.price_usd)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
