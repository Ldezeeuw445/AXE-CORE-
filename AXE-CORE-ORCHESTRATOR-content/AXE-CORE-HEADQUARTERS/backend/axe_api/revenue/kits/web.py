"""The free wedge: a single self-contained HTML page that analyses a trader's
CSV **in their own browser**.

This is the `free_tool` distribution channel made real, and it is the highest-
converting silent asset available to someone with no audience: it proves
competence before asking for anything, and it needs no signup, no server, and
no account.

The one property that makes it work commercially is also the one that makes it
honest: **the file never leaves the machine**. There is no fetch, no upload, no
analytics beacon — the CSV is read with the FileReader API and analysed in
JavaScript on the page. A trader handing their full P&L history to a stranger's
website is the objection that kills every competing tool, and the answer is not
a privacy policy, it is an architecture where the data physically cannot go
anywhere.

The JS mirrors journal.py's maths deliberately: same column aliases, same
per-symbol point-value derivation, same descriptive-not-advisory framing. When
one changes the other must follow — `test_kits.py::test_web_and_python_agree`
runs both over the sample file and compares the headline numbers.

`render_page()` produces the whole page as one string with no external
requests, so it drops onto Vercel, a Cloudflare Pages project, or a
`python -m http.server` folder unchanged.
"""

from __future__ import annotations

import json
from typing import Optional

from .journal import COLUMN_ALIASES, WEEKDAYS

# Passed into the page so the JS and Python cannot drift on header mapping.
_ALIASES_JSON = json.dumps({k: list(v) for k, v in COLUMN_ALIASES.items()})
_WEEKDAYS_JSON = json.dumps(list(WEEKDAYS))

_CSS = """
:root {
  --bg: #ffffff; --panel: #f7f8fa; --ink: #14161a; --muted: #5c6370;
  --line: #e3e6ea; --pos: #0f7a4d; --neg: #b3261e; --accent: #1b64f2;
}
:root:not([data-theme="light"]) { }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0e1013; --panel: #16191e; --ink: #e8eaed; --muted: #9aa1ab;
    --line: #262b33; --pos: #4ade80; --neg: #f87171; --accent: #6ea8fe;
  }
}
:root[data-theme="dark"] {
  --bg: #0e1013; --panel: #16191e; --ink: #e8eaed; --muted: #9aa1ab;
  --line: #262b33; --pos: #4ade80; --neg: #f87171; --accent: #6ea8fe;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 940px; margin: 0 auto; padding: 32px 20px 64px; }
h1 { font-size: 1.75rem; margin: 0 0 6px; letter-spacing: -0.02em; }
h2 { font-size: 1.1rem; margin: 32px 0 10px; letter-spacing: -0.01em; }
p.lede { color: var(--muted); margin: 0 0 24px; }
.privacy {
  border: 1px solid var(--line); border-left: 3px solid var(--accent);
  background: var(--panel); border-radius: 6px; padding: 12px 16px; margin: 0 0 24px;
  font-size: 0.92rem; color: var(--muted);
}
.privacy strong { color: var(--ink); }
.drop {
  border: 2px dashed var(--line); border-radius: 10px; background: var(--panel);
  padding: 36px 20px; text-align: center; cursor: pointer; transition: border-color .15s;
}
.drop:hover, .drop.over { border-color: var(--accent); }
.drop input { display: none; }
.hint { color: var(--muted); font-size: 0.88rem; margin-top: 8px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; }
.card .k { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: .04em; }
.card .v { font-size: 1.35rem; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 8px 12px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-weight: 500; font-size: 0.82rem; text-transform: uppercase; letter-spacing: .03em; }
.pos { color: var(--pos); } .neg { color: var(--neg); }
.note { color: var(--muted); font-size: 0.88rem; }
.err { color: var(--neg); font-weight: 500; }
footer { margin-top: 44px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.88rem; }
footer a { color: var(--accent); }
#out { display: none; }
"""

_JS = r"""
const ALIASES = __ALIASES__;
const WEEKDAYS = __WEEKDAYS__;
const CUR = __CURRENCY__;

const norm = h => h.trim().toLowerCase().replace(/_/g, " ");

function mapColumns(headers) {
  const found = {}, normed = new Map(headers.map(h => [norm(h), h]));
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) if (normed.has(a)) { found[field] = normed.get(a); break; }
    if (found[field]) continue;
    for (const [nh, orig] of normed) if (aliases.some(a => nh.includes(a))) { found[field] = orig; break; }
  }
  return found;
}

function toNum(v) {
  if (v == null) return null;
  let t = String(v).trim();
  if (!t) return null;
  const neg = t.startsWith("(") && t.endsWith(")");
  t = t.replace(/[()$€£¥\s]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
  else if ((t.match(/,/g) || []).length === 1 && !t.includes(".")) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function toDate(v) {
  if (!v) return null;
  const t = String(v).trim();
  // Broker formats: 2026.06.01 14:30:00 / 01/06/2026 14:30 / ISO
  let m = t.match(/^(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})[ T]?(\d{2})?:?(\d{2})?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = t.match(/^(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})[ T]?(\d{2})?:?(\d{2})?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  const d = new Date(t);
  return isNaN(d) ? null : d;
}

// Minimal RFC4180-ish parser: handles quoted fields and , ; or tab delimiters.
function parseCSV(text) {
  const first = text.slice(0, 4096);
  const delim = [",", ";", "\t"].sort(
    (a, b) => (first.split(b).length - first.split(a).length)
  )[0];
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ""));
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const sum = xs => xs.reduce((a, b) => a + b, 0);

function readTrades(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("the file has no data rows");
  const headers = rows[0].map(h => h.trim());
  const cols = mapColumns(headers);
  if (!cols.pnl) throw new Error(
    "no profit/loss column found. Looked for: " + ALIASES.pnl.join(", ") +
    ". Your file has: " + headers.join(", ")
  );
  const idx = {}; for (const [f, h] of Object.entries(cols)) idx[f] = headers.indexOf(h);
  const trades = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const pnl = toNum(r[idx.pnl]);
    if (pnl === null) { skipped++; continue; }
    trades.push({
      pnl,
      symbol: (idx.symbol >= 0 ? r[idx.symbol] || "" : "").trim(),
      side: (idx.side >= 0 ? r[idx.side] || "" : "").trim().toLowerCase(),
      size: idx.size >= 0 ? toNum(r[idx.size]) : null,
      entry: idx.entry_price >= 0 ? toNum(r[idx.entry_price]) : null,
      exit: idx.exit_price >= 0 ? toNum(r[idx.exit_price]) : null,
      stop: idx.stop_price >= 0 ? toNum(r[idx.stop_price]) : null,
      opened: idx.opened_at >= 0 ? toDate(r[idx.opened_at]) : null,
      closed: idx.closed_at >= 0 ? toDate(r[idx.closed_at]) : null,
      fees: (idx.fees >= 0 ? toNum(r[idx.fees]) : 0) || 0,
    });
  }
  if (!trades.length) throw new Error("no rows with a readable profit/loss value");
  return { trades, skipped };
}

// Point value per symbol, derived from the trades themselves — see journal.py.
function pointValues(trades) {
  const by = {};
  for (const t of trades) {
    if (t.entry == null || t.exit == null || !t.size) continue;
    const move = t.exit - t.entry;
    if (!move) continue;
    const dir = t.side.startsWith("s") ? -1 : 1;
    const denom = move * dir * t.size;
    if (!denom) continue;
    const ratio = t.pnl / denom;
    if (ratio > 0) (by[t.symbol || "*"] ||= []).push(ratio);
  }
  const out = {};
  for (const [s, v] of Object.entries(by)) if (v.length >= 3) out[s] = median(v);
  return out;
}

function riskUnit(trades) {
  const pv = pointValues(trades), planned = [];
  for (const t of trades) {
    const v = pv[t.symbol || "*"];
    if (v == null || t.stop == null || t.entry == null || !t.size) continue;
    const risk = Math.abs(t.entry - t.stop) * t.size * v;
    if (risk > 0) planned.push(risk);
  }
  if (planned.length >= Math.max(5, trades.length / 4))
    return { unit: median(planned), basis: "median planned risk (stop × size × point value, per symbol)" };
  const losses = trades.filter(t => t.pnl < 0).map(t => Math.abs(t.pnl));
  if (losses.length) return { unit: mean(losses), basis: "average losing trade (PROXY — no usable stop data)" };
  return { unit: null, basis: "unavailable" };
}

function bucket(trades, unit) {
  const pnls = trades.map(t => t.pnl), wins = pnls.filter(p => p > 0);
  const total = sum(pnls), exp = pnls.length ? total / pnls.length : 0;
  return {
    trades: trades.length, net: total,
    winRate: pnls.length ? wins.length / pnls.length : 0,
    expectancy: exp, rPerTrade: unit ? exp / unit : null,
  };
}

function analyse(trades) {
  const { unit, basis } = riskUnit(trades);
  const pnls = trades.map(t => t.pnl);
  const wins = pnls.filter(p => p > 0), losses = pnls.filter(p => p < 0);
  const grossWin = sum(wins), grossLoss = Math.abs(sum(losses));
  let streak = 0, worstStreak = 0;
  for (const p of pnls) { streak = p < 0 ? streak + 1 : 0; worstStreak = Math.max(worstStreak, streak); }
  const sorted = [...pnls].sort((a, b) => a - b);
  const worstN = Math.max(1, Math.ceil(sorted.length * 0.05));
  const worstSlice = sorted.slice(0, worstN);

  const byWeekday = {}, byHour = {}, bySymbol = {}, byHold = {};
  for (const t of trades) {
    const when = t.opened || t.closed;
    if (when) {
      (byWeekday[WEEKDAYS[(when.getDay() + 6) % 7]] ||= []).push(t);
      (byHour[String(when.getHours()).padStart(2, "0") + ":00"] ||= []).push(t);
    }
    if (t.symbol) (bySymbol[t.symbol] ||= []).push(t);
    if (t.opened && t.closed) {
      const m = Math.max((t.closed - t.opened) / 60000, 0);
      const label = m < 5 ? "< 5 min" : m < 30 ? "5–30 min" : m < 120 ? "30–120 min"
        : m < 480 ? "2–8 h" : m < 1440 ? "8–24 h" : "> 1 day";
      (byHold[label] ||= []).push(t);
    }
  }
  const mapBuckets = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, bucket(v, unit)]));
  return {
    trades: trades.length, net: sum(pnls),
    winRate: wins.length / pnls.length,
    profitFactor: grossLoss ? grossWin / grossLoss : null,
    avgWin: mean(wins), avgLoss: mean(losses),
    expectancy: sum(pnls) / pnls.length,
    expectancyR: unit ? (sum(pnls) / pnls.length) / unit : null,
    worstStreak, fees: sum(trades.map(t => t.fees)),
    riskUnit: unit, riskBasis: basis,
    worstN, worstSliceTotal: sum(worstSlice),
    worstShare: grossLoss ? Math.abs(sum(worstSlice)) / grossLoss : null,
    byWeekday: mapBuckets(byWeekday),
    byHour: Object.fromEntries(Object.entries(mapBuckets(byHour)).sort(([a], [b]) => a.localeCompare(b))),
    byHold: mapBuckets(byHold),
    bySymbol: Object.fromEntries(Object.entries(mapBuckets(bySymbol)).sort((a, b) => a[1].net - b[1].net)),
  };
}

const money = n => (n < 0 ? "-" : "") + CUR + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = n => `<span class="${n >= 0 ? "pos" : "neg"}">${money(n)}</span>`;

function table(title, rows) {
  const keys = Object.keys(rows);
  if (!keys.length) return "";
  const body = keys.map(k => {
    const b = rows[k];
    const r = b.rPerTrade == null ? "—"
      : `<span class="${b.rPerTrade >= 0 ? "pos" : "neg"}">${b.rPerTrade >= 0 ? "+" : ""}${b.rPerTrade.toFixed(2)}R</span>`;
    return `<tr><td>${k}</td><td>${b.trades}</td><td>${signed(b.net)}</td>
      <td>${(b.winRate * 100).toFixed(0)}%</td><td>${signed(b.expectancy)}</td><td>${r}</td></tr>`;
  }).join("");
  return `<h2>${title}</h2><div class="tablewrap"><table>
    <thead><tr><th></th><th>trades</th><th>net</th><th>win rate</th><th>expectancy</th><th>R/trade</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function render(a, skipped) {
  const cards = [
    ["trades", a.trades],
    ["net", money(a.net)],
    ["win rate", (a.winRate * 100).toFixed(1) + "%"],
    ["profit factor", a.profitFactor == null ? "n/a" : a.profitFactor.toFixed(2)],
    ["expectancy / trade", money(a.expectancy)],
    ["expectancy in R", a.expectancyR == null ? "n/a" : (a.expectancyR >= 0 ? "+" : "") + a.expectancyR.toFixed(3) + "R"],
    ["longest losing streak", a.worstStreak],
    ["fees", money(a.fees)],
  ].map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  let html = `<h2>Headline</h2><div class="cards">${cards}</div>`;
  html += `<p class="note">R unit: ${a.riskUnit == null ? "unavailable" : money(a.riskUnit)} — ${a.riskBasis}.</p>`;
  if (a.worstShare != null)
    html += `<h2>Loss concentration</h2><p>The worst ${a.worstN} trade(s) account for
      <strong>${(a.worstShare * 100).toFixed(0)}%</strong> of gross losses (${money(a.worstSliceTotal)}).</p>`;
  html += table("By weekday", a.byWeekday);
  html += table("By entry hour", a.byHour);
  html += table("By holding time", a.byHold);
  html += table("By symbol (worst first)", a.bySymbol);
  html += `<h2>How to read this</h2><p class="note">Every figure above describes trades that already
    happened. None of it is a prediction or a recommendation — a negative slice over a small sample is
    frequently noise, which is why every row shows its trade count.</p>`;
  if (skipped) html += `<p class="note">${skipped} row(s) were skipped: no readable profit/loss value.</p>`;
  return html;
}

const out = document.getElementById("out");
const drop = document.getElementById("drop");
const input = document.getElementById("file");

function handle(file) {
  const reader = new FileReader();
  reader.onload = () => {
    out.style.display = "block";
    try {
      const { trades, skipped } = readTrades(reader.result);
      out.innerHTML = render(analyse(trades), skipped);
    } catch (e) {
      out.innerHTML = `<p class="err">Could not read that file: ${e.message}</p>`;
    }
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  reader.readAsText(file);   // stays in this tab; nothing is uploaded
}

drop.addEventListener("click", () => input.click());
input.addEventListener("change", e => e.target.files[0] && handle(e.target.files[0]));
["dragenter", "dragover"].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]));
"""


def render_page(
    product_name: str = "Trade Journal Report",
    currency: str = "$",
    offer_url: str = "",
    offer_label: str = "",
    disclosure: str = "",
) -> str:
    """The whole tool as one HTML string — no external requests of any kind.

    `offer_url`/`offer_label` add the single link to the paid rung. It sits in
    the footer, after the tool has already done its job for free; a tool that
    asks before it delivers is an ad with a file picker.
    """
    js = (
        _JS.replace("__ALIASES__", _ALIASES_JSON)
        .replace("__WEEKDAYS__", _WEEKDAYS_JSON)
        .replace("__CURRENCY__", json.dumps(currency))
    )
    cta = ""
    if offer_url:
        label = offer_label or "See the full version"
        cta = f'<p><a href="{offer_url}">{label}</a></p>'
        if disclosure:
            cta += f'<p class="note">{disclosure}</p>'

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{product_name}</title>
<style>{_CSS}</style>
</head>
<body>
<div class="wrap">
  <h1>{product_name}</h1>
  <p class="lede">Drop in your broker's closed-trades CSV. You get expectancy, R-multiples,
  and the weekday / hour / holding-time / symbol breakdowns — the slices that usually show
  where the money actually went.</p>

  <div class="privacy">
    <strong>Your file never leaves this page.</strong> It is read in your browser and analysed
    here. There is no upload, no server, no account, and no tracking — view the source of this
    page if you want to check, it is a single file with no network calls in it.
  </div>

  <div class="drop" id="drop">
    <strong>Choose or drop your CSV</strong>
    <input type="file" id="file" accept=".csv,text/csv,text/plain">
    <div class="hint">MT4 / MT5 / cTrader / TradingView exports and most journal apps.
    Needs at least a profit column; stops, times and sizes unlock the rest.</div>
  </div>

  <div id="out"></div>

  <footer>
    <p>Descriptive statistics of trades you already made. Not trading advice, and not a
    prediction of future results.</p>
    {cta}
  </footer>
</div>
<script>{js}</script>
</body>
</html>
"""
