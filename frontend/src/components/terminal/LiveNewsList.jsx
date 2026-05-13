import React from "react";
import { Panel, Badge } from "../axe/Panel";
import { Newspaper, ExternalLink } from "lucide-react";

export function LiveNewsList({ snapshot }) {
  const items = (snapshot?.sources?.news?.items || []).slice(0, 14);
  return (
    <Panel
      title="Live News Ticker"
      dataTestId="news-list"
      right={<Badge tone="cyan">{items.length} ITEMS</Badge>}
    >
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="grid gap-2 items-center text-[11px]" style={{ gridTemplateColumns: "100px 1fr 12px" }}>
            <span className="axe-badge axe-badge-amber uppercase truncate" title={it.source}>
              <Newspaper size={10}/> {(it.country || it.source || "").slice(0, 12)}
            </span>
            <a href={it.url} target="_blank" rel="noreferrer" className="text-[#EAF2F7] hover:text-[#66E6FF] transition-colors truncate">{it.title}</a>
            <ExternalLink size={10} className="text-[#6F8193]"/>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
