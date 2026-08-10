"""The daily console — one page that holds the whole routine.

The engine can rank markets, price ladders, write copy and do the arithmetic.
It cannot post for you, and it should not: every answer goes out under a human
account, in a community with rules, in a thread whose tone only a person can
read. What it *can* do is remove every excuse between deciding to work and
working.

So this page is a checklist, not an automation:

  • today's questions, each a click away from the live search
  • the answer template, one button to copy, already carrying your tool link
  • the warm-up tracker per community, because the rule that keeps your
    accounts alive is the one nobody remembers on day nine
  • the exact product copy to paste into a checkout provider
  • the ledger command for what happened, ready to paste back

Self-contained, like the tool: no external requests, state in localStorage.
Open it every morning; when the checklist is done, the day's work is done.
"""

from __future__ import annotations

import json
from typing import Optional, Sequence

from .web import FAVICON, LOGO_SVG

_CSS = """
:root {
  --bg:#ffffff; --panel:#f7f8fa; --ink:#14161a; --muted:#5c6370;
  --line:#e3e6ea; --pos:#0f7a4d; --neg:#b3261e; --accent:#0086a8;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#0e1013; --panel:#16191e; --ink:#e8eaed; --muted:#9aa1ab;
    --line:#262b33; --pos:#4ade80; --neg:#f87171; --accent:#00D4FF;
  }
}
:root[data-theme="dark"] {
  --bg:#0e1013; --panel:#16191e; --ink:#e8eaed; --muted:#9aa1ab;
  --line:#262b33; --pos:#4ade80; --neg:#f87171; --accent:#00D4FF;
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font:15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width:900px; margin:0 auto; padding:28px 20px 72px; }
.brand { display:flex; align-items:center; gap:10px; margin:0 0 22px; }
.brand svg { width:26px; height:26px; display:block; flex:none; }
.brand .name { font-weight:600; font-size:.8rem; letter-spacing:.16em;
  text-transform:uppercase; color:var(--muted); }
h1 { font-size:1.6rem; margin:0 0 4px; letter-spacing:-.02em; }
h2 { font-size:1.05rem; margin:34px 0 10px; }
.sub { color:var(--muted); margin:0 0 22px; }
.step { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
  border-radius:8px; padding:16px 18px; margin:0 0 14px; }
.step h3 { margin:0 0 8px; font-size:.95rem; }
.step p { margin:0 0 10px; color:var(--muted); font-size:.92rem; }
.q { border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin:0 0 10px;
  background:var(--panel); }
.q .text { font-weight:500; margin-bottom:8px; }
.row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
a.btn, button.btn { display:inline-block; padding:6px 12px; border-radius:6px; cursor:pointer;
  border:1px solid var(--line); background:transparent; color:var(--accent);
  font:inherit; font-size:.86rem; text-decoration:none; }
a.btn:hover, button.btn:hover { border-color:var(--accent); }
button.primary { background:var(--accent); color:#04141a; border-color:var(--accent); font-weight:600; }
pre { background:var(--panel); border:1px solid var(--line); border-radius:8px;
  padding:14px; overflow-x:auto; font-size:.86rem; line-height:1.5; white-space:pre-wrap; }
label.check { display:flex; gap:9px; align-items:flex-start; padding:7px 0; cursor:pointer; }
label.check input { margin-top:4px; flex:none; }
label.check.done span { color:var(--muted); text-decoration:line-through; }
.bar { height:8px; border-radius:4px; background:var(--line); overflow:hidden; margin:8px 0 6px; }
.bar > div { height:100%; background:var(--accent); }
.stat { font-variant-numeric:tabular-nums; font-size:1.5rem; font-weight:600; }
.muted { color:var(--muted); font-size:.9rem; }
footer { margin-top:44px; padding-top:16px; border-top:1px solid var(--line);
  color:var(--muted); font-size:.86rem; }
.copied { color:var(--pos); font-size:.82rem; margin-left:8px; }
"""

_JS = r"""
// Checklist state lives in localStorage. No account, no sync, no server —
// same rule as the tool: this page never sends anything anywhere.
const KEY = "axe_console_v1";
const state = JSON.parse(localStorage.getItem(KEY) || "{}");
const today = new Date().toISOString().slice(0, 10);
if (state.day !== today) { state.day = today; state.checks = state.checks || {}; }

function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

document.querySelectorAll("input[type=checkbox][data-key]").forEach(box => {
  const key = box.dataset.key;
  box.checked = !!(state.checks && state.checks[key]);
  box.parentElement.classList.toggle("done", box.checked);
  box.addEventListener("change", () => {
    state.checks = state.checks || {};
    state.checks[key] = box.checked;
    box.parentElement.classList.toggle("done", box.checked);
    save();
  });
});

document.querySelectorAll("button[data-copy]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const target = document.getElementById(btn.dataset.copy);
    const text = target.value !== undefined ? target.value : target.textContent;
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const r = document.createRange(); r.selectNodeContents(target);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    const note = btn.nextElementSibling;
    if (note && note.classList.contains("copied")) {
      note.textContent = "copied";
      setTimeout(() => (note.textContent = ""), 1600);
    }
  });
});

// Ledger line builder — turns what happened into the command to paste back.
const led = document.getElementById("ledger-out");
function rebuild() {
  if (!led) return;
  const v = id => document.getElementById(id).value.trim() || "0";
  led.textContent =
    "python3 -m revenue.cli ledger-add \\\n" +
    "  --offer " + (document.getElementById("led-offer").value.trim() || "off_...") +
    " --tier " + (document.getElementById("led-tier").value.trim() || "tier_...") + " \\\n" +
    "  --channel " + document.getElementById("led-channel").value +
    " --reach " + v("led-reach") + " --clicks " + v("led-clicks") +
    " --sales " + v("led-sales") + " --revenue " + v("led-revenue") +
    " --minutes " + v("led-minutes");
}
document.querySelectorAll("#ledger input, #ledger select").forEach(el =>
  el.addEventListener("input", rebuild));
rebuild();
"""


def _answer_template(tool_url: str, brand: str) -> str:
    """The shape of a good forum answer.

    The bracketed parts are deliberately not auto-filled: an answer that is
    generic enough to post without editing is generic enough to be spotted and
    removed. The template's job is the structure — value first, link last,
    disclosure attached — not the words.
    """
    link = tool_url or "[your tool URL]"
    return f"""[Answer their exact question first, in your own words. 3-6 lines.
Be specific enough that it is useful even if the link below were deleted —
that is the test. Example shape:]

Short version: export your closed trades and group them before you change
anything. The three cuts that usually show something are weekday, hour of
entry, and holding time. Look at expectancy per trade rather than win rate —
a 30% win rate with 3R winners beats a 60% win rate with 0.5R winners — and
check the trade count on each slice, because a bad Friday over 6 trades is
noise, not a pattern.

[Then, and only then:]

I built a free tool that does exactly this cut: {link}
No signup, and the CSV is read in your browser — the file never leaves your
machine, so you are not handing your P&L to a stranger.

Disclosure: it is mine, and there is a paid version. The free one is complete
for what is described above."""


def _listing_copy(product_name: str, price: str, tool_url: str) -> str:
    return f"""PRODUCT NAME
{product_name}

PRICE
{price}

SHORT DESCRIPTION
Find out which days, hours and holding times actually cost you money — from
your own broker export, in ten minutes, without handing your trade history to
anyone.

DESCRIPTION
You already have the data. Your broker exports it. What you do not have is the
cut that shows where the money went.

This kit gives you:
• The full report generator — expectancy, R-multiples, profit factor, loss
  concentration, and breakdowns by weekday, entry hour, holding time and symbol
• A per-symbol point-value derivation, so mixed FX/index/metals journals give
  real R-multiples instead of nonsense
• The one-page checklist of what each number means and, more importantly, when
  a number is too small a sample to mean anything
• Runs entirely on your machine. Nothing is uploaded, ever.

Try the free version first: {tool_url}
If it tells you something useful, the paid kit is the same maths with the
report generator, the checklist, and every slice.

WHAT IT IS NOT
Not signals, not advice, not a prediction. Descriptive statistics of trades you
already made. What you do with them is your call.

REFUND POLICY
7-day no-questions refund.

DELIVERY
Instant download after payment."""


def render_console(
    questions: Sequence[dict],
    tool_url: str = "",
    checkout_url: str = "",
    product_name: str = "Trade Journal Kit",
    price: str = "$19",
    brand: str = "AXE CORE",
    communities: Sequence[str] = (),
    revenue_cents: int = 0,
    target_cents: int = 33000,
    offer_id: str = "",
    tier_id: str = "",
) -> str:
    """One self-contained page. `questions` comes from search_links.find_report()."""
    progress = min(revenue_cents / target_cents, 1.0) if target_cents else 0.0

    q_html = []
    for i, q in enumerate(questions, 1):
        links = "".join(
            f'<a class="btn" href="{url}" target="_blank" rel="noopener">{name}</a>'
            for name, url in q["links"].items()
        )
        q_html.append(
            f'<div class="q"><div class="text">{i}. “{q["query"]}”</div>'
            f'<div class="row">{links}'
            f'<label class="check" style="margin-left:auto">'
            f'<input type="checkbox" data-key="q{i}"><span>answered</span></label>'
            f"</div></div>"
        )

    warmup_html = "".join(
        f'<label class="check"><input type="checkbox" data-key="warm-{c}">'
        f"<span>{c} — 5 helpful answers posted with no link</span></label>"
        for c in communities
        if c.startswith("r/")
    )

    tool_line = (
        f'<a class="btn" href="{tool_url}" target="_blank" rel="noopener">Open your tool</a>'
        if tool_url else '<span class="muted">no tool URL set — pass --tool-url</span>'
    )
    checkout_line = (
        f'<a class="btn" href="{checkout_url}" target="_blank" rel="noopener">Open checkout</a>'
        if checkout_url else
        '<span class="muted">no checkout yet — create one, then re-render with --checkout-url</span>'
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{brand} — Daily console</title>
<link rel="icon" href="{FAVICON}">
<style>{_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="brand">{LOGO_SVG}<span class="name">{brand}</span></div>
  <h1>Daily console</h1>
  <p class="sub">One hour. Answer three real questions, record what happened. That is the job.</p>

  <div class="step">
    <h3>Progress to ${target_cents/100:,.0f}</h3>
    <div class="bar"><div style="width:{progress*100:.1f}%"></div></div>
    <div class="stat">${revenue_cents/100:,.2f}</div>
    <p class="muted">Recorded, settled revenue only. It stays at zero until you
    put a real sale in the ledger — that is deliberate.</p>
  </div>

  <h2>1 · Answer three questions</h2>
  <p class="sub">Open the search, read the thread, answer if you can genuinely help.
  Skip anything you cannot answer well — a weak answer costs more than no answer.</p>
  {"".join(q_html)}

  <h2>2 · The answer shape</h2>
  <div class="step">
    <p>Edit the bracketed parts. Never paste it as-is: an answer generic enough
    to post unedited is generic enough to get removed.</p>
    <pre id="answer-tpl">{_answer_template(tool_url, brand)}</pre>
    <div class="row">
      <button class="btn primary" data-copy="answer-tpl">Copy template</button>
      <span class="copied"></span>
      {tool_line}
    </div>
  </div>

  <h2>3 · Warm-up state</h2>
  <div class="step">
    <p>Five helpful answers with no link before your first answer that carries one.
    This is the rule that keeps the accounts, and the one everybody skips.</p>
    {warmup_html or '<span class="muted">no communities configured</span>'}
  </div>

  <h2>4 · The checkout</h2>
  <div class="step">
    <p>Paste this into Lemon Squeezy, Gumroad or Paddle. Use a Merchant of Record
    so EU VAT, invoicing and delivery are handled for you.</p>
    <pre id="listing">{_listing_copy(product_name, price, tool_url or "[your tool URL]")}</pre>
    <div class="row">
      <button class="btn primary" data-copy="listing">Copy listing</button>
      <span class="copied"></span>
      {checkout_line}
      <a class="btn" href="https://app.lemonsqueezy.com/products/new" target="_blank" rel="noopener">Lemon Squeezy</a>
      <a class="btn" href="https://gumroad.com/products/new" target="_blank" rel="noopener">Gumroad</a>
    </div>
  </div>

  <h2>5 · Record what happened</h2>
  <div class="step" id="ledger">
    <p>At the end of the session. Reach and clicks can be rough; revenue must be
    settled money only.</p>
    <div class="row" style="margin-bottom:10px">
      <input id="led-offer" placeholder="offer id" value="{offer_id}" class="btn" style="color:var(--ink)">
      <input id="led-tier" placeholder="tier id" value="{tier_id}" class="btn" style="color:var(--ink)">
      <select id="led-channel" class="btn" style="color:var(--ink)">
        <option>forum_answer</option><option>free_tool</option>
        <option>marketplace_listing</option><option>seo_page</option>
        <option>community_dm</option><option>faceless_video</option>
      </select>
    </div>
    <div class="row" style="margin-bottom:10px">
      <input id="led-reach" type="number" placeholder="reach" class="btn" style="color:var(--ink);width:110px">
      <input id="led-clicks" type="number" placeholder="clicks" class="btn" style="color:var(--ink);width:110px">
      <input id="led-sales" type="number" placeholder="sales" class="btn" style="color:var(--ink);width:110px">
      <input id="led-revenue" type="number" placeholder="revenue (cents)" class="btn" style="color:var(--ink);width:160px">
      <input id="led-minutes" type="number" placeholder="minutes" class="btn" style="color:var(--ink);width:120px">
    </div>
    <pre id="ledger-out"></pre>
    <div class="row">
      <button class="btn primary" data-copy="ledger-out">Copy command</button>
      <span class="copied"></span>
    </div>
  </div>

  <footer>
    Nothing on this page is sent anywhere; the checklist is stored in this browser only.
    Re-render it tomorrow for a fresh set of questions.
  </footer>
</div>
<script>{_JS}</script>
</body>
</html>
"""
