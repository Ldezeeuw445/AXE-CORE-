import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(here, { recursive: true });

function tabs(on) {
  const items = [
    ['home', 'Home', 'home.html'],
    ['trading', 'Trading', 'trading-watchlist.html'],
    ['companion', 'AXE', 'companion-home.html'],
    ['memory', 'Memory', 'axon-home.html'],
    ['more', 'More', 'more.html'],
  ];
  return `<nav class="tabs">${items.map(([id, label, href]) =>
    `<a${id === on ? ' class="on"' : ''} href="${href}">${label}</a>`).join('')}</nav>`;
}

function seg(items, on) {
  return `<div class="seg">${items.map(([id, label, href]) =>
    `<a${id === on ? ' class="on"' : ''} href="${href}">${label}</a>`).join('')}</div>`;
}

function page(title, inner, tab, { composer = false, glow = false, studio = null } = {}) {
  return `<!doctype html>
<html lang="en" data-look="black">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=384, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="mockup.css" />
</head>
<body>
  <div class="phone">
    ${inner}
    ${composer ? `<div class="composer"${glow ? ' style="--glow:.45"' : ''}><span class="grow">Ask AXE anything…</span><span class="mic${glow ? ' on' : ''}">●</span></div>` : ''}
    ${studio ?? ''}
    ${tabs(tab)}
  </div>
</body>
</html>
`;
}

const T_SEG = [
  ['wl', 'Markets', 'trading-watchlist.html'],
  ['ch', 'Chart', 'trading-chart.html'],
  ['pos', 'Positions', 'trading-positions.html'],
  ['al', 'Algo', 'trading-algo.html'],
  ['in', 'Intel', 'trading-intel.html'],
];
const N_SEG = [
  ['pl', 'Pipeline', 'northsea-pipeline.html'],
  ['de', 'Deals', 'northsea-deal.html'],
  ['net', 'Network', 'northsea-counterparties.html'],
  ['dr', 'Drafts', 'northsea-drafts.html'],
  ['ok', 'OK', 'northsea-approvals.html'],
];
const C_SEG = [
  ['ho', 'Home', 'companion-home.html'],
  ['mk', 'Markets', 'companion-markets.html'],
  ['ch', 'Chart', 'companion-chart.html'],
  ['ax', 'AXE', 'companion-axe.html'],
  ['ac', 'Account', 'companion-account.html'],
];
const A_SEG = [
  ['re', 'Recall', 'axon-home.html'],
  ['ca', 'Capture', 'axon-capture.html'],
  ['th', 'Threads', 'axon-thread.html'],
  ['co', 'Cores', 'axon-cores.html'],
  ['mo', 'More', 'axon-obsidian.html'],
];
const D_STUDIO = (on) => `<nav class="studio">
  <a${on === 'files' ? ' class="on"' : ''} href="developer-files.html">Files</a>
  <a${on === 'code' ? ' class="on"' : ''} href="developer-editor.html">Code</a>
  <a${on === 'agent' ? ' class="on"' : ''} href="developer-agent.html">Agent</a>
  <a${on === 'preview' ? ' class="on"' : ''} href="developer-preview.html">Preview</a>
  <a${on === 'git' ? ' class="on"' : ''} href="developer-git.html">Git</a>
</nav>`;

const files = {};

files['more.html'] = page('More', `
    <div class="top"><h1>Apps</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <p class="note">Long-press to pin to the bar. Max 4 + More.</p>
      <div class="appgrid">
        <a class="app" href="northsea-pipeline.html"><i>⚓</i>NorthSea</a>
        <a class="app" href="browser-start.html"><i>🧭</i>Browser</a>
        <a class="app" href="developer-projects.html"><i>{ }</i>Developer</a>
        <a class="app" href="agents.html"><i>●</i>Agents</a>
        <a class="app" href="systems.html"><i>▣</i>Systems</a>
        <a class="app" href="tasks.html"><i>✓</i>Tasks</a>
        <a class="app" href="settings.html"><i>⚙</i>Settings</a>
        <a class="app" href="notifications.html"><i>!</i>Alerts</a>
        <a class="app" href="more-pins.html"><i>☰</i>Pin bar</a>
      </div>
      <div class="search">Search every tab</div>
      <div class="card">
        <div class="kicker">Command</div>
        <div class="row"><div class="grow title">Calendar</div></div>
        <div class="row"><div class="grow title">Cron</div></div>
        <div class="row"><div class="grow title">Ledger</div></div>
      </div>
    </div>
`, 'more');

files['more-pins.html'] = page('Pin bar', `
    <div class="top"><h1>Pin to bar</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <p class="note">Four slots. Drag or tap to replace. More is fixed.</p>
      <div class="card">
        <div class="kicker">Current bar</div>
        <div class="row"><div class="grow title">1 · Home</div><span class="tiny">locked</span></div>
        <div class="row"><div class="grow title">2 · Trading</div><span class="tiny">unpin</span></div>
        <div class="row"><div class="grow title">3 · AXE</div><span class="tiny">unpin</span></div>
        <div class="row"><div class="grow title">4 · Memory</div><span class="tiny">unpin</span></div>
        <div class="row"><div class="grow title">5 · More</div><span class="tiny">locked</span></div>
      </div>
      <div class="card">
        <div class="kicker">Replace slot 3 with</div>
        <div class="row"><div class="grow title">NorthSea</div></div>
        <div class="row"><div class="grow title">Browser</div></div>
        <div class="row"><div class="grow title">Developer</div></div>
        <div class="row"><div class="grow title">Agents</div></div>
      </div>
    </div>
`, 'more');

files['trading-watchlist.html'] = page('Trading', `
    <div class="top"><h1>Trading</h1><button class="icon" type="button">☀</button></div>
    ${seg(T_SEG, 'wl')}
    <div class="scroll">
      <p class="tiny">Read-only · no orders</p>
      <div class="card">
        <div class="row">
          <div class="grow"><div class="title">XAUUSD</div><div class="sub">Gold spot</div></div>
          <div class="spark"></div>
          <div class="num"><div class="price">4,181.10</div><div class="chg down">−0.35%</div></div>
        </div>
        <div class="row">
          <div class="grow"><div class="title">BTCUSD</div><div class="sub">Bitcoin</div></div>
          <div class="spark up"></div>
          <div class="num"><div class="price">81,394</div><div class="chg up">+0.12%</div></div>
        </div>
        <div class="row">
          <div class="grow"><div class="title">SPY</div><div class="sub">S&amp;P 500 ETF</div></div>
          <div class="spark"></div>
          <div class="num"><div class="price">763.25</div><div class="chg down">−1.88%</div></div>
        </div>
        <div class="row">
          <div class="grow"><div class="title">QQQ</div><div class="sub">Nasdaq 100</div></div>
          <div class="spark"></div>
          <div class="num"><div class="price">709.80</div><div class="chg down">−4.47%</div></div>
        </div>
      </div>
    </div>
`, 'trading');

files['trading-chart.html'] = page('Chart', `
    <div class="top"><h1>XAUUSD · 1D</h1><button class="icon" type="button">☀</button></div>
    ${seg(T_SEG, 'ch')}
    <div class="chips"><span class="chip">1H</span><span class="chip">4H</span><span class="chip on">1D</span></div>
    <div class="chart"></div>
    <div class="card">
      <div class="grid2">
        <div class="metric">Bid<b>4,180.90</b></div>
        <div class="metric">Ask<b>4,181.30</b></div>
      </div>
      <div class="sub" style="margin-top:8px">Position marker 0.3 lot · SL 4,150 · TP 4,240 — view only</div>
    </div>
`, 'trading');

files['trading-positions.html'] = page('Positions', `
    <div class="top"><h1>Positions</h1><button class="icon" type="button">☀</button></div>
    ${seg(T_SEG, 'pos')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Open · read-only</div>
        <div class="row">
          <div class="grow"><div class="title">XAUUSD buy 0.30</div><div class="sub">SL 4,150 · TP 4,240</div></div>
          <div class="ok-txt num">+$214</div>
        </div>
        <div class="row">
          <div class="grow"><div class="title">BTCUSD buy 0.02</div><div class="sub">No SL</div></div>
          <div class="err-txt num">−$80</div>
        </div>
      </div>
      <div class="card">
        <div class="grid2">
          <div class="metric">Equity<b>$12,480</b></div>
          <div class="metric">Risk left<b>1.4%</b></div>
        </div>
      </div>
      <p class="tiny">Close / modify lives on the desk, not here.</p>
    </div>
`, 'trading');

files['trading-algo.html'] = page('AXE Algo', `
    <div class="top"><h1>AXE Algo</h1><button class="icon" type="button">☀</button></div>
    ${seg(T_SEG, 'al')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Status</div>
        <div class="row"><span class="dot warn"></span><div class="grow title">Idle — no order from phone</div></div>
        <div class="sub">Last cycle 14:12 · gold 1D bias still short-term long, waiting for NY open.</div>
      </div>
      <div class="card">
        <div class="kicker">Last decision</div>
        <div class="title">Hold XAUUSD</div>
        <div class="sub">Spread wide vs session average. No new risk until London close.</div>
      </div>
      <div class="card">
        <div class="kicker">Forbidden on this device</div>
        <div class="row"><div class="grow title">Market / limit / close</div><span class="err-txt">off</span></div>
      </div>
    </div>
`, 'trading');

files['trading-intel.html'] = page('Intel', `
    <div class="top"><h1>Intel</h1><button class="icon" type="button">☀</button></div>
    ${seg(T_SEG, 'in')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">AXE brief · XAUUSD</div>
        <div class="title">Dollar bid overnight, gold held 4,170.</div>
        <div class="sub">Companion correlation: medium · feeds 4 · no order implied.</div>
      </div>
      <div class="card">
        <div class="kicker">Memory</div>
        <div class="row"><div class="grow title">Do not fade NFP spike</div><span class="tiny">lesson</span></div>
        <div class="row"><div class="grow title">London close mean-revert</div><span class="tiny">lesson</span></div>
      </div>
    </div>
`, 'trading', { composer: true });

files['northsea-pipeline.html'] = page('NorthSea', `
    <div class="top"><h1>NorthSea</h1><button class="icon" type="button">☀</button></div>
    ${seg(N_SEG, 'pl')}
    <div class="scroll">
      <div class="chips">
        <span class="chip on">All 12</span><span class="chip">Blocked 2</span><span class="chip">OK 1</span>
      </div>
      <div class="card">
        <div class="kicker">Qualifying</div>
        <div class="title">Thermal coal 50,000 MT</div>
        <div class="sub">ZA → IN · FOB Richards Bay · 62% ready</div>
        <div class="sub warn-txt">Waiting: buyer KYC</div>
      </div>
      <div class="card">
        <div class="kicker">Blocked</div>
        <div class="title">Urea 25,000 MT</div>
        <div class="sub">SA → BR · CFR Santos</div>
        <div class="sub err-txt">Blocker: LC wording mismatch</div>
      </div>
      <div class="card">
        <div class="kicker">Closing</div>
        <div class="title">Copper conc. 8,000 DMT</div>
        <div class="sub">CL → CN · next: draft intro</div>
      </div>
    </div>
`, 'more');

files['northsea-deal.html'] = page('Deal', `
    <div class="top"><h1>NS-1841</h1><button class="icon" type="button">☀</button></div>
    ${seg(N_SEG, 'de')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Thermal coal · Qualifying</div>
        <div class="title">50,000 MT · FOB Richards Bay</div>
        <div class="grid2" style="margin-top:10px">
          <div class="metric">Ready<b>62%</b></div>
          <div class="metric">Waiting<b>Buyer</b></div>
        </div>
      </div>
      <div class="card">
        <div class="kicker">Blocker</div>
        <div class="title">Buyer KYC pack incomplete</div>
        <div class="sub">Next: request remaining UBO docs. Crew: qualify.</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn grow" type="button">Ask AXE</button>
        <button class="btn grow" type="button">Open draft</button>
      </div>
      <p class="tiny">No send from this phone.</p>
    </div>
`, 'more');

files['northsea-counterparties.html'] = page('Network', `
    <div class="top"><h1>Network</h1><button class="icon" type="button">☀</button></div>
    ${seg(N_SEG, 'net')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Buyer</div>
        <div class="row"><div class="grow"><div class="title">Aarav Steel</div><div class="sub">India · KYC partial</div></div><span class="warn-txt">KYC</span></div>
      </div>
      <div class="card">
        <div class="kicker">Supplier</div>
        <div class="row"><div class="grow"><div class="title">Highveld Coal</div><div class="sub">South Africa · last mail 2d</div></div><span class="ok-txt">OK</span></div>
      </div>
      <button class="btn" type="button">Draft intro (stays concept)</button>
    </div>
`, 'more');

files['northsea-drafts.html'] = page('Drafts', `
    <div class="top"><h1>Drafts</h1><button class="icon" type="button">☀</button></div>
    ${seg(N_SEG, 'dr')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Intro mail · not sent</div>
        <div class="title">Aarav Steel × Highveld — 50kt RB1</div>
        <div class="sub" style="margin-top:8px">We can introduce both sides on FOB RB, subject to KYC and LC wording. Commission to NorthSea on close.</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn grow" type="button">Edit</button>
        <button class="btn grow" type="button">Ask AXE</button>
      </div>
      <button class="btn" type="button">Send to approval</button>
      <p class="tiny">Approve is internal. Never emails the counterparty from here.</p>
    </div>
`, 'more');

files['northsea-approvals.html'] = page('Approvals', `
    <div class="top"><h1>Approvals</h1><button class="icon" type="button">☀</button></div>
    ${seg(N_SEG, 'ok')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Waiting · 1</div>
        <div class="title">Send intro NS-1841?</div>
        <div class="sub">Draft reviewed. AXE asks to mail both sides.</div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn ok grow" type="button">Approve</button>
          <button class="btn no grow" type="button">Decline</button>
        </div>
      </div>
      <p class="tiny">Same GoedkeuringActie as Agents. Approve ≠ send until the desk worker runs.</p>
    </div>
`, 'more');

const safariBot = `<div class="safari-bot"><span>←</span><span>→</span><span>□↑</span><span>☆</span><span>☰</span></div>`;

files['browser-start.html'] = `<!doctype html>
<html lang="en" data-look="black">
<head><meta charset="utf-8" /><meta name="viewport" content="width=384, initial-scale=1" />
<title>Browser</title><link rel="stylesheet" href="mockup.css" /></head>
<body>
<div class="phone full">
  <div class="safari-top"><a class="icon" href="home.html" style="text-decoration:none">△</a>
    <div class="omnibox">Search or enter site</div></div>
  <div class="scroll" style="padding:8px 14px">
    <div class="kicker">Favourites</div>
    <div class="fav">
      <div>Google</div><div>GitHub</div><div>Supabase</div><div>AXE</div>
      <div>Vercel</div><div>Claude</div><div>ChatGPT</div><div>+</div>
    </div>
    <div class="card"><div class="kicker">Recent</div>
      <div class="row"><div class="grow title">axecompanion.com</div></div>
      <div class="row"><div class="grow title">github.com/Ldezeeuw445</div></div>
    </div>
  </div>
  ${safariBot}
</div>
</body></html>`;

files['browser-page.html'] = `<!doctype html>
<html lang="en" data-look="black">
<head><meta charset="utf-8" /><meta name="viewport" content="width=384, initial-scale=1" />
<title>Page</title><link rel="stylesheet" href="mockup.css" /></head>
<body>
<div class="phone full">
  <div class="safari-top"><a class="icon" href="home.html" style="text-decoration:none">△</a>
    <div class="omnibox">github.com</div></div>
  <div class="page">
    <div style="font-size:11px;opacity:.5">https://github.com/Ldezeeuw445/AXE-CORE-</div>
    <h2 style="margin:12px 0 8px">AXE-CORE-</h2>
    <p>Luka's HQ. orchestrator branch. Phone Home is TelefoonSphere.</p>
    <p style="opacity:.6">WebView · /api/browse proxy · no second orb.</p>
  </div>
  ${safariBot}
</div>
</body></html>`;

files['browser-tabs.html'] = `<!doctype html>
<html lang="en" data-look="black">
<head><meta charset="utf-8" /><meta name="viewport" content="width=384, initial-scale=1" />
<title>Tabs</title><link rel="stylesheet" href="mockup.css" /></head>
<body>
<div class="phone full">
  <div class="safari-top"><div class="grow title" style="padding-left:12px">Tabs</div>
    <button class="icon" type="button">+</button></div>
  <div class="scroll" style="padding:8px 14px">
    <div class="tabsgrid">
      <div class="tabcard"><span class="x">×</span><b>GitHub</b><div class="sub">AXE-CORE- · orchestrator</div></div>
      <div class="tabcard"><span class="x">×</span><b>Companion</b><div class="sub">axecompanion.com</div></div>
      <div class="tabcard"><span class="x">×</span><b>AXON</b><div class="sub">app.axon-memory.com</div></div>
      <div class="tabcard"><span class="x">×</span><b>New Tab</b><div class="sub">Start page</div></div>
    </div>
  </div>
  ${safariBot}
</div>
</body></html>`;

files['browser-bookmarks.html'] = `<!doctype html>
<html lang="en" data-look="black">
<head><meta charset="utf-8" /><meta name="viewport" content="width=384, initial-scale=1" />
<title>Bookmarks</title><link rel="stylesheet" href="mockup.css" /></head>
<body>
<div class="phone full">
  <div class="safari-top"><a class="icon" href="browser-page.html" style="text-decoration:none">←</a>
    <div class="grow title">Bookmarks</div></div>
  <div class="scroll" style="padding:8px 14px">
    <div class="search">Search bookmarks</div>
    <div class="card"><div class="kicker">AXE</div>
      <div class="row"><div class="grow title">AXE Core</div></div>
      <div class="row"><div class="grow title">Companion</div></div>
    </div>
    <div class="card"><div class="kicker">Dev</div>
      <div class="row"><div class="grow title">GitHub</div></div>
      <div class="row"><div class="grow title">Supabase</div></div>
      <div class="row"><div class="grow title">Vercel</div></div>
    </div>
    <div class="card"><div class="kicker">History</div>
      <div class="row"><div class="grow title">Google</div><span class="tiny">1h</span></div>
    </div>
  </div>
  ${safariBot}
</div>
</body></html>`;

files['browser-reader.html'] = `<!doctype html>
<html lang="en" data-look="black">
<head><meta charset="utf-8" /><meta name="viewport" content="width=384, initial-scale=1" />
<title>Reader</title><link rel="stylesheet" href="mockup.css" /></head>
<body>
<div class="phone full">
  <div class="safari-top"><a class="icon" href="browser-page.html" style="text-decoration:none">←</a>
    <div class="grow title">Reader</div><button class="icon" type="button">A</button></div>
  <div class="scroll" style="padding:8px 18px">
    <div class="reader">
      <div class="tiny">GITHUB.COM · 4 MIN</div>
      <h2>AXE CORE</h2>
      <p>Headquarters for Luka's agents, trading desk and NorthSea. The phone shell is this WebView. After the lockscreen you land on TelefoonSphere — nothing else in between.</p>
      <p>Ask AXE to summarize from this view. Mic stays off until you tap it.</p>
    </div>
    <div class="composer"><span class="grow">Summarize this page…</span><span class="mic">●</span></div>
  </div>
  ${safariBot}
</div>
</body></html>`;

files['companion-home.html'] = page('Companion', `
    <div class="top"><h1>Companion</h1><button class="icon" type="button">☀</button></div>
    ${seg(C_SEG, 'ho')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Account pulse</div>
        <div class="row"><span class="dot ok"></span><div class="grow title">MetaAPI live · connected</div></div>
        <div class="grid2">
          <div class="metric">Equity<b>$12,480</b></div>
          <div class="metric">Day P/L<b class="ok-txt">+$134</b></div>
          <div class="metric">Risk left<b>1.4%</b></div>
          <div class="metric">Open<b>2</b></div>
        </div>
      </div>
      <div class="card">
        <div class="kicker">AXE brief</div>
        <div class="title">Hold gold. Dollar bid, wait NY.</div>
        <div class="sub">Alert: NFP 20:30 — no new risk.</div>
      </div>
    </div>
`, 'companion', { composer: true });

files['companion-markets.html'] = page('Companion markets', `
    <div class="top"><h1>Markets</h1><button class="icon" type="button">☀</button></div>
    ${seg(C_SEG, 'mk')}
    <div class="scroll">
      <div class="card">
        <div class="row"><div class="grow title">XAUUSD</div><div class="price">4,181.10</div></div>
        <div class="row"><div class="grow title">EURUSD</div><div class="price">1.1642</div></div>
        <div class="row"><div class="grow title">US500</div><div class="price">6,640</div></div>
      </div>
      <p class="tiny">Same quote as the chart. No second price.</p>
    </div>
`, 'companion');

files['companion-chart.html'] = page('Companion chart', `
    <div class="top"><h1>XAUUSD · H1</h1><button class="icon" type="button">☀</button></div>
    ${seg(C_SEG, 'ch')}
    <div class="chart"></div>
    <div class="chips"><span class="chip">Draw</span><span class="chip">TF</span><span class="chip">Alerts</span></div>
    <p class="tiny">CompanionChart port · ticket hidden on phone.</p>
`, 'companion');

files['companion-axe.html'] = page('AXE', `
    <div class="top"><h1>AXE</h1><button class="icon" type="button">☀</button></div>
    ${seg(C_SEG, 'ax')}
    <div class="scroll">
      <div class="chips">
        <span class="chip">Analyse chart</span><span class="chip">What changed</span>
        <span class="chip">Check risk</span><span class="chip">Journal</span>
      </div>
      <div class="card">
        <div class="kicker">AXE</div>
        <div class="sub">Gold held 4,170. I would not add risk into NFP. No order from this phone.</div>
      </div>
    </div>
`, 'companion', { composer: true, glow: true });

files['companion-account.html'] = page('Account', `
    <div class="top"><h1>Account</h1><button class="icon" type="button">☀</button></div>
    ${seg(C_SEG, 'ac')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Active</div>
        <div class="row"><span class="dot ok"></span><div class="grow title">Live · MetaAPI</div></div>
        <div class="row"><div class="grow title">Demo</div></div>
        <div class="row"><div class="grow title">Prop</div></div>
      </div>
      <div class="card">
        <div class="kicker">Journal</div>
        <div class="row"><div class="grow title">NFP wait · 17 Oct</div></div>
      </div>
      <p class="tiny">No withdraw / send.</p>
    </div>
`, 'companion');

files['axon-home.html'] = page('AXON', `
    <div class="top"><h1>AXON</h1><button class="icon" type="button">☀</button></div>
    ${seg(A_SEG, 're')}
    <div class="scroll">
      <div class="search">Recall anything…</div>
      <div class="card">
        <div class="kicker">Pack</div>
        <div class="row"><div class="grow"><div class="title">No keypad after lockscreen</div><div class="sub">source AXE Core · weight high</div></div></div>
        <div class="row"><div class="grow"><div class="title">Gold: do not fade NFP</div><div class="sub">source Companion · trading</div></div></div>
        <div class="row"><div class="grow"><div class="title">NorthSea never send from phone</div><div class="sub">source HQ · northsea</div></div></div>
      </div>
    </div>
`, 'memory');

files['axon-capture.html'] = page('Capture', `
    <div class="top"><h1>Capture</h1><button class="icon" type="button">☀</button></div>
    ${seg(A_SEG, 'ca')}
    <div class="scroll">
      <div class="card" style="min-height:120px">
        <div class="sub">Remember for every model Luka uses…</div>
      </div>
      <div class="chips"><span class="chip on">personal</span><span class="chip">trading</span><span class="chip">code</span></div>
      <button class="btn" type="button">Save to AXON</button>
      <p class="tiny">Falls back to rag_memories if AXON CORS blocks the phone origin.</p>
    </div>
`, 'memory');

files['axon-thread.html'] = page('Thread', `
    <div class="top"><h1>Thread</h1><button class="icon" type="button">☀</button></div>
    ${seg(A_SEG, 'th')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Active thread</div>
        <div class="title">Phone shell after lockscreen</div>
        <div class="sub">5 memories · last capture 2m</div>
      </div>
      <div class="card">
        <div class="sub">Not a chatbot. This is the pack AXE will load next turn.</div>
      </div>
    </div>
`, 'memory');

files['axon-cores.html'] = page('Cores', `
    <div class="top"><h1>Cores</h1><button class="icon" type="button">☀</button></div>
    ${seg(A_SEG, 'co')}
    <div class="scroll">
      <div class="card">
        <div class="row"><div class="grow title">Personal</div><span class="tiny">depth 4</span></div>
        <div class="row"><div class="grow title">Trading</div><span class="tiny">depth 7</span></div>
        <div class="row"><div class="grow title">NorthSea</div><span class="tiny">depth 3</span></div>
        <div class="row"><div class="grow title">Code</div><span class="tiny">depth 5</span></div>
      </div>
      <p class="tiny">Canon nouns. Production schema is still memory_items — map honestly.</p>
    </div>
`, 'memory');

files['axon-obsidian.html'] = page('Obsidian', `
    <div class="top"><h1>Obsidian</h1><button class="icon" type="button">☀</button></div>
    ${seg(A_SEG, 'mo')}
    <div class="scroll">
      <div class="chips"><span class="chip on">Obsidian</span><span class="chip">Trading memory</span><span class="chip">Knowledge</span></div>
      <div class="card">
        <div class="row"><div class="grow title">Phone Home is final</div><span class="tiny">today</span></div>
        <div class="row"><div class="grow title">NorthSea DB incident</div><span class="tiny">11 Oct</span></div>
      </div>
    </div>
`, 'memory');

files['axon-trading.html'] = page('Trading memory', `
    <div class="top"><h1>Trading memory</h1><button class="icon" type="button">☀</button></div>
    ${seg(A_SEG, 'mo')}
    <div class="scroll">
      <div class="card">
        <div class="kicker">Lessons</div>
        <div class="row"><div class="grow title">NFP spike — sit on hands</div></div>
        <div class="row"><div class="grow title">London close fade only with HTF</div></div>
      </div>
      <p class="tiny">/memory/trading — agent lessons, not a second chart.</p>
    </div>
`, 'memory');

files['developer-projects.html'] = page('Developer', `
    <div class="top"><h1>AXE Developer</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <p class="note">Replit + Cursor + FlutterFlow. Luka now; BYOK later.</p>
      <div class="card">
        <div class="kicker">Projects</div>
        <div class="row"><div class="grow"><div class="title">AXE-CORE-</div><div class="sub">orchestrator · whitelist</div></div></div>
        <div class="row"><div class="grow"><div class="title">AXE-COMPANION-OS-</div><div class="sub">deployed</div></div></div>
        <div class="row"><div class="grow"><div class="title">axon-memory-app</div><div class="sub">main</div></div></div>
      </div>
      <button class="btn" type="button">New via agent</button>
    </div>
`, 'more', { studio: D_STUDIO('files') });

files['developer-files.html'] = page('Files', `
    <div class="top"><h1>AXE-CORE-</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card tree">
        <div class="row"><div class="grow title">src/domain/androidPin.ts</div></div>
        <div class="row"><div class="grow title">src/presentation/pages/PhonePinScreen.tsx</div></div>
        <div class="row"><div class="grow title">docs/device-manager/DESIGN.md</div></div>
        <div class="row"><div class="grow title">e2e/phone-a17/phone-a17.spec.ts</div></div>
      </div>
    </div>
`, 'more', { studio: D_STUDIO('files') });

files['developer-editor.html'] = page('Editor', `
    <div class="top"><h1>androidPin.ts</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card code">export const PIN_STANDAARD_UIT = true;

export async function telefoonPinNodig() {
  if (!(await pinIsGezet())) return false;
  return leesPinSoort() === 'numeric';
}</div>
      <div class="keybar"><span>Tab</span><span>{ }</span><span>( )</span><span>=&gt;</span><span>←</span><span>→</span></div>
    </div>
`, 'more', { studio: D_STUDIO('code') });

files['developer-agent.html'] = page('Agent', `
    <div class="top"><h1>Agent</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="chips"><span class="chip on">Cursor</span><span class="chip">Claude</span><span class="chip">Codex</span></div>
      <div class="card">
        <div class="kicker">Diff</div>
        <div class="diff"><div class="add">+ PIN_STANDAARD_UIT = true</div><div class="del">- navigate('/lock/pin')</div></div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn ok grow" type="button">Apply</button>
        <button class="btn no grow" type="button">Reject</button>
      </div>
    </div>
`, 'more', { composer: true, studio: D_STUDIO('agent') });

files['developer-preview.html'] = page('Preview', `
    <div class="top"><h1>Preview</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card" style="height:280px;display:grid;place-items:center">
        <div class="tiny">localhost preview · one port</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn grow" type="button">Run</button>
        <button class="btn grow" type="button">→ Code Agent</button>
      </div>
    </div>
`, 'more', { studio: D_STUDIO('preview') });

files['developer-builder.html'] = page('Builder', `
    <div class="top"><h1>Visual builder</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card" style="height:200px">
        <div class="kicker">Selected</div>
        <div class="title">Approve button</div>
        <div class="sub">min-height 44 · source of truth = TSX</div>
      </div>
      <button class="btn" type="button">→ Code Agent</button>
      <p class="tiny">No secret second document. Design mode talks to the file.</p>
    </div>
`, 'more', { studio: D_STUDIO('preview') });

files['developer-git.html'] = page('Git', `
    <div class="top"><h1>Git</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card">
        <div class="kicker">orchestrator · whitelist</div>
        <div class="row"><div class="grow title">androidPin.ts</div><span class="tiny">M</span></div>
        <div class="row"><div class="grow title">DESIGN.md</div><span class="tiny">M</span></div>
      </div>
      <div class="search">Commit message</div>
      <button class="btn" type="button">Commit (never main)</button>
      <button class="btn" type="button">Open PR as task</button>
    </div>
`, 'more', { studio: D_STUDIO('git') });

files['agents.html'] = page('Agents', `
    <div class="top"><h1>Agents</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card">
        <div class="kicker">Waiting · 1</div>
        <div class="title">Wingman</div>
        <div class="sub warn-txt">Restart axe_api on VPS?</div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn ok grow" type="button">Approve</button>
          <button class="btn no grow" type="button">Decline</button>
        </div>
      </div>
      <div class="card">
        <div class="kicker">Working</div>
        <div class="row"><span class="dot ok"></span><div class="grow"><div class="title">Trading</div><div class="sub">Watching XAUUSD 1D — no orders</div></div></div>
        <div class="row"><span class="dot ok"></span><div class="grow"><div class="title">NorthSea</div><div class="sub">Refreshing counterparties</div></div></div>
      </div>
    </div>
`, 'more');

files['systems.html'] = page('Systems', `
    <div class="top"><h1>Your systems</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <p class="tiny">4/4 online · remote actions confirm first</p>
      <div class="card">
        <div class="row"><span class="dot ok"></span><div class="grow title">Mac mini</div><span class="tiny">Online</span></div>
        <div class="grid2"><div class="metric">CPU<b>40%</b></div><div class="metric">RAM<b>75%</b></div></div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn" type="button">Wake</button>
          <button class="btn" type="button">Screenshot</button>
        </div>
      </div>
      <div class="card">
        <div class="row"><span class="dot ok"></span><div class="grow title">iMac</div></div>
        <div class="grid2"><div class="metric">CPU<b>34%</b></div><div class="metric">RAM<b>68%</b></div></div>
      </div>
      <div class="card">
        <div class="row"><span class="dot ok"></span><div class="grow title">VPS API</div><span class="tiny">api.axecompanion.com</span></div>
        <div class="row" style="gap:8px">
          <button class="btn" type="button">Health</button>
          <button class="btn" type="button">Logs</button>
        </div>
      </div>
    </div>
`, 'more');

files['tasks.html'] = page('Tasks', `
    <div class="top"><h1>Tasks</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="chips"><span class="chip on">Open 8</span><span class="chip">Overdue 0</span><span class="chip">Follow-ups 8</span></div>
      <div class="card">
        <div class="row"><div class="grow title">Bundle HQ into Android WebView</div></div>
        <div class="row"><div class="grow title">NorthSea DB incident follow-up</div></div>
        <div class="row"><div class="grow title">Companion sidecar from phone (VPS)</div></div>
      </div>
    </div>
`, 'more');

files['notifications.html'] = page('Notifications', `
    <div class="top"><h1>Notifications</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card">
        <div class="row"><div class="grow"><div class="title">Wingman wants OK</div><div class="sub">Restart axe_api</div></div></div>
        <div class="row" style="gap:8px">
          <button class="btn ok grow" type="button">Approve</button>
          <button class="btn no grow" type="button">Decline</button>
        </div>
      </div>
      <div class="card">
        <div class="row"><div class="grow title">NFP in 4h — Algo idle</div></div>
      </div>
    </div>
`, 'more');

files['settings.html'] = page('Settings', `
    <div class="top"><h1>Settings</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card">
        <div class="kicker">Look</div>
        <div class="row"><div class="grow title">Dark</div><span class="ok-txt">on</span></div>
        <div class="row"><div class="grow title">Light</div></div>
      </div>
      <div class="card">
        <div class="kicker">Transparency · this look</div>
        <div class="slider"></div>
        <div class="tiny">Saved separately for dark and light.</div>
      </div>
      <div class="card">
        <div class="kicker">Mic</div>
        <div class="row"><div class="grow title">Only on tap</div><span class="ok-txt">on</span></div>
        <div class="row"><div class="grow title">Hey AXE</div><span class="tiny">off</span></div>
      </div>
    </div>
`, 'more');

files['chat.html'] = page('Chat', `
    <div class="top"><h1>AXE</h1><button class="icon" type="button">☀</button></div>
    <div class="scroll">
      <div class="card">
        <div class="kicker">AXE</div>
        <div class="sub">I'm on the phone Home sphere after swipe. Mic stays dark until you tap it.</div>
      </div>
    </div>
`, 'home', { composer: true, glow: true });

files['pin.html'] = page('PIN dormant', `
    <div class="top"><h1>Enter PIN</h1></div>
    <div class="banner">Dormant. Not in the unlock flow. Swipe goes to Home. Code kept, PIN_STANDAARD_UIT.</div>
    <div class="dots"><i></i><i></i><i></i><i></i></div>
    <div class="pad">
      <div class="key">1</div><div class="key">2</div><div class="key">3</div>
      <div class="key">4</div><div class="key">5</div><div class="key">6</div>
      <div class="key">7</div><div class="key">8</div><div class="key">9</div>
      <div></div><div class="key">0</div><div class="key">⌫</div>
    </div>
`, 'home');

for (const [name, html] of Object.entries(files)) {
  writeFileSync(join(here, name), html);
}
console.log(`wrote ${Object.keys(files).length} files`);
