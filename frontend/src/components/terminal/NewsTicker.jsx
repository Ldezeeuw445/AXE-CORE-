import React, { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export function NewsTicker({ snapshot }) {
  const items = useMemo(() => {
    const crypto = (snapshot?.sources?.crypto?.items || []).slice(0, 12);
    const macro = (snapshot?.sources?.macro?.items || []).filter((x) => x.source === "frankfurter");
    const out = [];
    crypto.forEach(c => out.push({
      sym: c.symbol, val: c.price_usd, ch: c.change_24h_pct
    }));
    macro.forEach(m => out.push({ sym: m.title.replace("USD/", ""), val: m.value, ch: null }));
    return out;
  }, [snapshot]);

  const display = items.length ? items : [{ sym: "AXE", val: "—", ch: 0 }];
  const doubled = [...display, ...display];

  return (
    <div className="bg-[#050505] border-b border-white/5 overflow-hidden" data-testid="news-ticker">
      <div className="axe-ticker-track py-1.5 px-2">
        {doubled.map((it, i) => {
          const pos = (it.ch ?? 0) >= 0;
          return (
            <span key={i} className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="text-[10px] uppercase tracking-[0.08em] text-[#6F8193]">{it.sym}</span>
              <span className="axe-num text-[#EAF2F7] font-medium">
                {typeof it.val === "number" ? it.val.toLocaleString(undefined, { maximumFractionDigits: 4 }) : it.val}
              </span>
              {it.ch != null && (
                <span className={pos ? "text-[#2EF2C2]" : "text-[#FF4D6D]"}>
                  {pos ? <TrendingUp size={10} className="inline"/> : <TrendingDown size={10} className="inline"/>} {it.ch >= 0 ? "+" : ""}{(it.ch ?? 0).toFixed(2)}%
                </span>
              )}
              <span className="text-[#6F8193] px-2">|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
