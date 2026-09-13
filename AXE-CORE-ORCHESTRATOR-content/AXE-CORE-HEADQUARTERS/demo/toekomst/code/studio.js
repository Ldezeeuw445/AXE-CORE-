/* Code studio — standen, toestellen, de demo-pagina in een kader. */
(function () {
  'use strict';
  const CODE = (window.CODE = {});
  CODE.titel = 'Device manager';
  CODE.paneel = 'Device';
  CODE.look = 'Dark';
  CODE.bestand = 'MobileSystem.tsx';
  CODE.laag = 'kop';
  CODE.geaccepteerd = false;
  CODE.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TOESTEL = {
    phone: { naam: 'iPhone 15 Pro', maat: '393 × 852 @3x', w: 393, h: 852, klasse: 'iphone' },
    tablet: { naam: 'iPad Pro 11', maat: '820 × 1180 @2x', w: 820, h: 1180, klasse: 'ipad' },
    desktop: { naam: 'Desktop', maat: '1280 × 800', w: 1280, h: 800, klasse: 'deskframe' },
  };

  CODE.demoPagina = (vorm = 'phone') => {
    const extra = (vorm === 'tablet' ? ' dm--tablet' : vorm === 'desktop' ? ' dm--desktop' : '')
      + (CODE.look === 'Light' ? ' dm--licht' : '');
    const dok = (aan) => ['Device', 'Use', 'Core', 'Tabs', 'Look']
      .map((n, i) => {
        const ic = ['telefoon', 'cpu', 'kompas', 'raster', 'tandwiel'][i];
        return `<span class="tab ${n === aan ? 'aan' : ''}" data-dm-tab="${n}"><span class="rond">${AXE.ic(ic)}</span>${n}</span>`;
      }).join('');
    const live = `<span class="rechts" style="color:var(--ok)"><i class="stip"></i> live</span>`;
    const lichtAan = CODE.look === 'Light' ? 'aan' : '';
    const donkerAan = CODE.look === 'Dark' ? 'aan' : '';
    const p = CODE.paneel;
    let lijf = '';
    if (p === 'Use') {
      lijf = `
        <section class="dm-kaart dm-kaart--breed ${CODE.laag === 'use' ? 'aan' : ''}" data-laag="use">
          <h2>Use ${live}</h2>
          <div class="dm-regel"><span>Computer use</span><span class="w c-ok">Mac Mini</span><small>system.info is observe · terminal.free always asks</small></div>
          <div class="dm-regel"><span>Browser use</span><span class="w">VPS</span><small>Camofox through api.axecompanion.com</small></div>
        </section>`;
    } else if (p === 'Core') {
      lijf = `
        <section class="dm-kaart${vorm !== 'phone' ? ' dm-kaart--breed' : ''} ${CODE.laag === 'trading' ? 'aan' : ''}" data-laag="trading">
          <h2>Trading OS <span class="rechts">XAUUSD</span></h2>
          <div class="groot">4 346.46</div>
          <p class="log">mean-reversion · London in 12 min</p>
        </section>
        <section class="dm-kaart ${CODE.laag === 'memories' ? 'aan' : ''}" data-laag="memories">
          <h2>Memory</h2>
          <div class="groot">19 038</div>
          <p class="log">notes on this account</p>
        </section>
        <section class="dm-kaart ${CODE.laag === 'crew' ? 'aan' : ''}" data-laag="crew">
          <h2>Crew</h2>
          <div class="dm-rij"><span><i class="stip c-ok"></i> 2 running</span><span><i class="stip c-warn"></i> 1 waiting</span></div>
        </section>`;
    } else if (p === 'Tabs') {
      lijf = `
        <section class="dm-kaart dm-kaart--breed ${CODE.laag === 'tabs' ? 'aan' : ''}" data-laag="tabs">
          <h2>Desktop tabs</h2>
          <p class="log">Browser · Code Editor · Trading Intel · Memory · EVE</p>
          <p class="log">24 tabs, same paths as the dock.</p>
        </section>`;
    } else if (p === 'Look') {
      lijf = `
        <section class="dm-kaart dm-kaart--breed ${CODE.laag === 'look' ? 'aan' : ''}" data-laag="look">
          <h2>Look</h2>
          <p class="log">Light frost or smoked dark. The plate flips; cards stay the same material.</p>
          <div class="dm-rij"><span class="${lichtAan ? 'c-accent' : ''}">Light</span><span class="${donkerAan ? 'c-accent' : ''}">Dark</span></div>
        </section>`;
    } else {
      lijf = `
        <section class="dm-kaart${vorm !== 'phone' ? ' dm-kaart--breed' : ''} ${CODE.laag === 'memories' ? 'aan' : ''}" data-laag="memories">
          <h2>This phone · AXE Core ${live}</h2>
          <div class="groot">19 038</div>
          <p class="log">memories on this account</p>
          <div class="dm-rij"><span><i class="stip c-ok"></i> 8 open</span><span><i class="stip c-accent"></i> 3 agents</span></div>
        </section>
        <section class="dm-kaart ${CODE.laag === 'link' ? 'aan' : ''}" data-laag="link">
          <h2>Link</h2>
          <div class="dm-regel"><span>Mac worker</span><span class="w c-ok">Mac Mini</span><small>computer use · axe-computer-worker</small></div>
          <div class="dm-regel"><span>VPS</span><span class="w">api.axecompanion.com</span><small>every provider call goes through here</small></div>
        </section>
        <section class="dm-kaart ${CODE.laag === 'trading' ? 'aan' : ''}" data-laag="trading">
          <h2>Trading OS <span class="rechts">XAUUSD</span></h2>
          <div class="groot">4 346.46</div>
          <p class="log">mean-reversion · London in 12 min</p>
        </section>
        ${vorm !== 'phone' ? `<section class="dm-kaart${vorm === 'tablet' ? ' dm-kaart--breed' : ''}">
          <h2>From this phone</h2>
          <p class="log">Use — Mac and browser agent. Tabs — every desktop tab. Core — trading, memory, crew.</p>
        </section>
        <section class="dm-kaart">
          <h2>Open on Mac</h2>
          <div class="dm-regel"><span>Browser</span><span class="w">#/browser</span><small>floating sphere · live page</small></div>
          <div class="dm-regel"><span>Code</span><span class="w c-accent">this studio</span><small>Code · Canvas · Preview</small></div>
        </section>
        <section class="dm-kaart">
          <h2>Crew</h2>
          <div class="dm-rij"><span><i class="stip c-ok"></i> 2 running</span><span><i class="stip c-warn"></i> 1 waiting</span></div>
          <p class="log">research · design · code</p>
        </section>` : ''}`;
    }
    return `
      <div class="dm${extra}">
        <header class="dm__kop" data-laag="kop">
          <div data-laag="titel"><div class="dm__merk">AXE Core</div><div class="dm__titel">${CODE.esc(CODE.titel || 'Device manager')}</div></div>
          <div class="dm__look"><span data-dm-look="Light" class="${lichtAan}">Light</span><span data-dm-look="Dark" class="${donkerAan}">Dark</span></div>
        </header>
        <main class="dm__lijf">${lijf}</main>
        <nav class="dm__dok" data-laag="dok">${dok(p)}</nav>
      </div>`;
  };

  CODE.iphone = (binnen) => `
    <div class="iphone">
      <span class="iphone__knop iphone__knop--stil"></span>
      <span class="iphone__knop iphone__knop--vol1"></span>
      <span class="iphone__knop iphone__knop--vol2"></span>
      <span class="iphone__knop iphone__knop--aan"></span>
      <div class="iphone__scherm">
        <div class="iphone__eiland"></div>
        ${binnen}
      </div>
    </div>`;

  CODE.ipad = (binnen) => `
    <div class="ipad">
      <span class="ipad__camera"></span>
      <div class="ipad__scherm">${binnen}</div>
    </div>`;

  CODE.desk = (binnen) => `
    <div class="deskframe">
      <div class="deskframe__balk">
        <span class="verkeers"><i></i><i></i><i></i></span>
        <span class="url"><i class="stip c-ok"></i> localhost:5199/#/mobile</span>
        <span>AXE CORE</span>
      </div>
      <div class="deskframe__scherm">${binnen}</div>
    </div>`;

  CODE.zetStand = (stand) => {
    const studio = document.querySelector('.studio');
    if (!studio) return;
    studio.dataset.stand = stand;
    document.body.dataset.studioStand = stand;
    document.querySelectorAll('.standen button').forEach((b) => b.classList.toggle('aan', b.dataset.stand === stand));
    requestAnimationFrame(() => {
      CODE.pasSchaal();
      requestAnimationFrame(CODE.pasSchaal);
    });
  };

  CODE.kaderVoor = (id) => {
    const vorm = id === 'tablet' ? 'tablet' : id === 'desktop' ? 'desktop' : 'phone';
    const pagina = CODE.demoPagina(vorm);
    if (id === 'tablet') return CODE.ipad(pagina);
    if (id === 'desktop') return CODE.desk(pagina);
    return CODE.iphone(pagina);
  };

  CODE.zetToestel = (id) => {
    const studio = document.querySelector('.studio');
    if (!studio) return;
    studio.dataset.toestel = id;
    document.querySelectorAll('.toestellen button').forEach((b) => b.classList.toggle('aan', b.dataset.toestel === id));
    const t = TOESTEL[id] || TOESTEL.phone;
    const kader = CODE.kaderVoor(id);
    const slot = document.getElementById('code-toestel');
    const info = document.getElementById('code-toestel-info');
    if (slot) slot.innerHTML = kader;
    if (info) info.innerHTML = `${t.naam} · ${t.maat} · scale <span id="podium-schaal">—</span>`;
    const art = document.querySelector('.artboard .kader');
    if (art) art.innerHTML = `<div class="toestel">${kader}</div>`;
    const chip = document.getElementById('artboard-chip');
    if (chip) chip.textContent = `Artboard · ${id}`;
    requestAnimationFrame(() => {
      CODE.pasSchaal();
      requestAnimationFrame(CODE.pasSchaal);
    });
  };

  CODE.zetOntwerp = (aan) => {
    const studio = document.querySelector('.studio');
    if (!studio) return;
    studio.dataset.ontwerp = aan ? 'aan' : 'uit';
    document.querySelectorAll('[data-ontwerp-knop]').forEach((knop) => knop.classList.toggle('c-accent', aan));
    CODE.pasSchaal();
  };

  CODE.pasSchaal = () => {
    const studio = document.querySelector('.studio');
    if (!studio) return;
    const stand = studio.dataset.stand;
    const id = studio.dataset.toestel || 'phone';
    const t = TOESTEL[id] || TOESTEL.phone;
    if (stand === 'code') {
      const vak = document.querySelector('.toestel-slot');
      const slot = document.getElementById('code-toestel');
      const houder = document.getElementById('code-toestel-houder');
      if (!vak || !slot) return;
      const r = vak.getBoundingClientRect();
      const s = Math.max(0.18, Math.min((r.height - 8) / t.h, (r.width - 8) / t.w));
      slot.style.setProperty('--schaal', s.toFixed(3));
      if (houder) {
        houder.style.width = Math.round(t.w * s) + 'px';
        houder.style.height = Math.round(t.h * s) + 'px';
      }
      const el = document.getElementById('podium-schaal');
      if (el) el.textContent = s.toFixed(2);
    }
    if (stand === 'canvas') {
      const board = document.querySelector('.artboard');
      const kader = document.querySelector('.artboard .kader');
      if (!board || !kader) return;
      const r = board.getBoundingClientRect();
      const s = Math.max(0.2, Math.min((r.height - 160) / t.h, (r.width - 48) / t.w));
      kader.style.setProperty('--schaal', s.toFixed(3));
    }
    if (stand === 'preview') {
      const rij = document.querySelector('.rij-toestellen');
      if (!rij) return;
      const R = rij.getBoundingClientRect();
      const maxH = Math.max(180, R.height - 120);
      const n = document.querySelectorAll('[data-preview-schaal]').length || 3;
      const maxW = Math.max(120, (R.width - 48 - (n - 1) * 36) / n);
      document.querySelectorAll('[data-preview-schaal]').forEach((el) => {
        const d = TOESTEL[el.dataset.previewSchaal];
        if (!d) return;
        const s = Math.max(0.14, Math.min(maxH / d.h, maxW / d.w));
        const kind = el.firstElementChild;
        if (kind) kind.style.setProperty('--schaal', s.toFixed(3));
        el.style.width = Math.round(d.w * s) + 'px';
        el.style.height = Math.round(d.h * s) + 'px';
      });
    }
  };

  const LAAG = {
    pagina: { naam: 'Device manager', regel: 'MobileSystem', klasse: 'axe-dm' },
    kop: { naam: 'Device header', regel: ':227', klasse: 'axe-dm__kop' },
    titel: { naam: 'Title', regel: ':231', klasse: 'axe-dm__titel' },
    look: { naam: 'Look toggle', regel: ':238', klasse: 'axe-dm__look' },
    memories: { naam: 'Card · memories', regel: ':244', klasse: 'dm-kaart' },
    link: { naam: 'Card · Link', regel: ':258', klasse: 'dm-kaart' },
    trading: { naam: 'Card · Trading OS', regel: ':268', klasse: 'dm-kaart' },
    dok: { naam: 'Dock · five tabs', regel: ':280', klasse: 'dm__dok' },
    use: { naam: 'Use', regel: ':120', klasse: 'dm-kaart' },
    tabs: { naam: 'Desktop tabs', regel: ':148', klasse: 'dm-kaart' },
    crew: { naam: 'Crew', regel: ':190', klasse: 'dm-kaart' },
  };

  CODE.zetLaag = (id) => {
    CODE.laag = id || 'kop';
    document.querySelectorAll('.lagen [data-laag]').forEach((el) => {
      el.classList.toggle('aan', el.dataset.laag === CODE.laag);
    });
    document.querySelectorAll('.dm-kaart[data-laag]').forEach((el) => {
      el.classList.toggle('aan', el.dataset.laag === CODE.laag);
    });
    const info = LAAG[CODE.laag] || LAAG.kop;
    document.querySelectorAll('.inspecteur .kop').forEach((kop) => {
      const ic = kop.querySelector('svg');
      const prefix = ic ? ic.outerHTML + ' ' : '';
      kop.innerHTML = prefix + info.naam + ' <span class="t-mono">' + info.regel + '</span>';
    });
    document.querySelectorAll('.inspecteur .veld').forEach((veld) => {
      const label = (veld.querySelector('label') || {}).textContent || '';
      const w = veld.querySelector('span.w');
      if (label === 'Class' && w) w.textContent = info.klasse;
    });
  };

  CODE.ververs = () => {
    const studio = document.querySelector('.studio');
    if (!studio) return;
    CODE.zetToestel(studio.dataset.toestel || 'phone');
    document.querySelectorAll('[data-preview-schaal]').forEach((el) => {
      el.innerHTML = '<div class="toestel">' + CODE.kaderVoor(el.dataset.previewSchaal) + '</div>';
    });
    if (CODE.bestand === 'MobileSystem.tsx') CODE.tekenBron();
    CODE.zetLaag(CODE.laag);
    requestAnimationFrame(() => { CODE.pasSchaal(); requestAnimationFrame(CODE.pasSchaal); });
  };

  CODE.bronVoor = (naam) => {
    const titel = CODE.esc(CODE.titel || 'Device manager');
    const plus = CODE.geaccepteerd ? '' : ' plus';
    const min = CODE.geaccepteerd ? '' : ' min';
    const bron = {
      'MobileSystem.tsx': [
        ['<span class="k">export default function</span> <span class="f">MobileSystem</span><span class="p">()</span> <span class="p">{</span>'],
        ['  <span class="k">const</span> <span class="p">[</span>look<span class="p">,</span> setLook<span class="p">]</span> <span class="p">=</span> <span class="f">useLook</span><span class="p">();</span>'],
        ['  <span class="k">const</span> <span class="p">[</span>paneel<span class="p">,</span> setPaneel<span class="p">]</span> <span class="p">=</span> <span class="f">useState</span><span class="p">&lt;</span>Paneel<span class="p">&gt;(</span><span class="s">\'home\'</span><span class="p">);</span>'],
        [''],
        ['  <span class="k">return</span> <span class="p">(</span>'],
        ['    <span class="p">&lt;</span><span class="t">div</span> <span class="a">className</span><span class="p">=</span><span class="s">"axe-dm"</span> <span class="a">data-paneel</span><span class="p">={</span>paneel<span class="p">}&gt;</span>'],
        ['      <span class="p">&lt;</span><span class="t">header</span> <span class="a">className</span><span class="p">=</span><span class="s">"axe-dm__kop"</span><span class="p">&gt;</span>', plus],
        ['        <span class="p">&lt;</span><span class="t">div</span><span class="p">&gt;</span>', plus],
        ['          <span class="p">&lt;</span><span class="t">div</span> <span class="a">className</span><span class="p">=</span><span class="s">"axe-dm__merk"</span><span class="p">&gt;</span>AXE Core<span class="p">&lt;/</span><span class="t">div</span><span class="p">&gt;</span>', plus],
        ['          <span class="p">&lt;</span><span class="t">div</span> <span class="a">className</span><span class="p">=</span><span class="s">"axe-dm__titel"</span><span class="p">&gt;</span>' + titel + '<span class="p">&lt;/</span><span class="t">div</span><span class="p">&gt;</span>', plus + ' aan'],
        ['        <span class="p">&lt;/</span><span class="t">div</span><span class="p">&gt;</span>', plus],
        ['        <span class="p">&lt;</span><span class="t">LookToggle</span> <span class="a">look</span><span class="p">={</span>look<span class="p">}</span> <span class="a">onChange</span><span class="p">={</span>setLook<span class="p">}</span> <span class="p">/&gt;</span>', ' aan'],
        ['      <span class="p">&lt;/</span><span class="t">header</span><span class="p">&gt;</span>', plus],
        ['      <span class="p">&lt;</span><span class="t">main</span> <span class="a">className</span><span class="p">=</span><span class="s">"axe-dm__lijf"</span><span class="p">&gt;</span>'],
        ['        <span class="p">{</span>paneel <span class="p">===</span> <span class="s">\'home\'</span> <span class="p">&amp;&amp;</span> <span class="p">&lt;</span><span class="t">HomePaneel</span> <span class="p">/&gt;}</span>', min],
        ['        <span class="p">{</span>paneel <span class="p">===</span> <span class="s">\'home\'</span> <span class="p">&amp;&amp;</span> <span class="p">&lt;</span><span class="t">HomePaneel</span> <span class="p">/&gt;}</span>', plus],
        ['        <span class="p">{</span>paneel <span class="p">===</span> <span class="s">\'use\'</span> <span class="p">&amp;&amp;</span> <span class="p">&lt;</span><span class="t">UsePaneel</span> <span class="p">/&gt;}</span>', plus],
        ['      <span class="p">&lt;/</span><span class="t">main</span><span class="p">&gt;</span>'],
        ['    <span class="p">&lt;/</span><span class="t">div</span><span class="p">&gt;</span>'],
        ['  <span class="p">);</span>'],
        ['<span class="p">}</span>'],
      ],
      'Home.tsx': [
        ['<span class="k">export default function</span> <span class="f">Home</span><span class="p">()</span> <span class="p">{</span>'],
        ['  <span class="k">const</span> look <span class="p">=</span> <span class="f">useLook</span><span class="p">();</span>'],
        [''],
        ['  <span class="k">return</span> <span class="p">(</span>'],
        ['    <span class="p">&lt;</span><span class="t">Sphere</span> <span class="a">look</span><span class="p">={</span>look<span class="p">} /&gt;</span>'],
        ['    <span class="p">&lt;</span><span class="t">Composer</span> <span class="a">placeholder</span><span class="p">=</span><span class="s">"Ask anything. @models, prompts…"</span> <span class="p">/&gt;</span>'],
        ['  <span class="p">);</span>'],
        ['<span class="p">}</span>'],
      ],
      'BrowserPage.tsx': [
        ['<span class="k">export default function</span> <span class="f">BrowserPage</span><span class="p">()</span> <span class="p">{</span>'],
        ['  <span class="k">return</span> <span class="p">&lt;</span><span class="t">PreviewPanel</span> <span class="a">src</span><span class="p">=</span><span class="s">"#/browser"</span> <span class="p">/&gt;</span>'],
        ['<span class="p">}</span>'],
      ],
      'CodeEditorPage.tsx': [
        ['<span class="c">/* Claude-sessie 3 — deze demo raakt hem niet. */</span>'],
        ['<span class="k">export default function</span> <span class="f">CodeEditorPage</span><span class="p">()</span> <span class="p">{</span>'],
        ['  <span class="k">return</span> <span class="p">&lt;</span><span class="t">EditorShell</span> <span class="p">/&gt;</span>'],
        ['<span class="p">}</span>'],
      ],
      'device-manager.css': [
        ['.axe-dm__titel <span class="p">{</span>'],
        ['  font: <span class="n">600</span> <span class="n">22px</span>/<span class="n">1.05</span> var(--ui);'],
        ['  color: var(--ink);'],
        ['  letter-spacing: <span class="n">-0.04em</span>;'],
        ['<span class="p">}</span>'],
        [''],
        ['.axe-dm__kop <span class="p">{</span>'],
        ['  padding: <span class="n">56px</span> <span class="n">16px</span> <span class="n">10px</span>;'],
        ['<span class="p">}</span>'],
      ],
      'tabs.ts': [
        ['<span class="k">export const</span> TABS <span class="p">=</span> <span class="p">[</span>'],
        ['  <span class="s">\'browser\'</span>, <span class="s">\'code-editor\'</span>, <span class="s">\'trading-intel\'</span>,'],
        ['  <span class="s">\'memory\'</span>, <span class="s">\'eve\'</span>,'],
        ['<span class="p">]</span> <span class="k">as const</span>'],
      ],
    };
    return bron[naam] || null;
  };

  CODE.tekenBron = () => {
    const vak = document.querySelector('.code');
    if (!vak) return;
    const regels = CODE.bronVoor(CODE.bestand);
    if (!regels) {
      vak.innerHTML = '<div class="l"><span class="c">// ' + CODE.esc(CODE.bestand) + ' — open this in the real editor</span></div>';
      return;
    }
    const diff = CODE.bestand === 'MobileSystem.tsx' && !CODE.geaccepteerd
      ? '<div class="diffbalk ruit"><span class="c-accent">' + AXE.ic('bot') + '</span> Agent edit <span class="t-mono c-ok">+8</span> <span class="t-mono c-err">−1</span><button class="knop knop--primair" data-accept>Accept ⌘⏎</button><button class="knop" data-reject>Reject</button></div>'
      : '';
    vak.innerHTML = regels.map(([h, k]) => '<div class="l' + (k ? ' ' + k.trim() : '') + '"><span>' + h + '</span></div>').join('') + diff;
    vak.querySelector('[data-accept]')?.addEventListener('click', CODE.accepteer);
    vak.querySelector('[data-reject]')?.addEventListener('click', CODE.wijsAf);
  };

  CODE.zetBron = (naam) => {
    CODE.bestand = naam;
    CODE.tekenBron();
    document.querySelectorAll('.boom [data-file]').forEach((el) => el.classList.toggle('aan', el.dataset.file === naam));
    document.querySelectorAll('.bestandtab').forEach((el) => el.classList.toggle('aan', el.dataset.file === naam));
    const kruimel = document.querySelector('.kruimel b');
    if (kruimel) kruimel.textContent = naam;
  };

  CODE.accepteer = () => {
    CODE.geaccepteerd = true;
    CODE.tekenBron();
    document.querySelector('.boom .r.aan.gewijzigd')?.classList.remove('gewijzigd');
    document.querySelectorAll('.bestandtab.aan .stip').forEach((s) => s.remove());
    const wacht = document.getElementById('agent-wacht');
    if (wacht) wacht.innerHTML = '<span class="c-ok">✓</span><span>Wrote the file</span><span class="t-mono c-ok">done</span>';
  };

  CODE.wijsAf = () => {
    CODE.geaccepteerd = true;
    CODE.titel = 'Device manager';
    const inp = document.getElementById('inspect-titel');
    if (inp) inp.value = CODE.titel;
    CODE.ververs();
    CODE.agentStap('Rejected the header diff', 'undo');
  };

  CODE.agentStap = (tekst, meta) => {
    const body = document.getElementById('agent-body');
    if (!body) return;
    body.insertAdjacentHTML('beforeend', '<div class="stap"><span class="c-accent">▸</span><span>' + tekst + '</span><span class="t-mono c-3">' + (meta || 'now') + '</span></div>');
    body.scrollTop = body.scrollHeight;
  };

  CODE.termRegel = (cmd, uit) => {
    const body = document.getElementById('term-body');
    if (!body) return;
    body.insertAdjacentHTML('beforeend', '<div><span class="prompt">❯</span> ' + cmd + '</div>' + (uit ? '<div class="ok">' + uit + '</div>' : ''));
    body.scrollTop = body.scrollHeight;
  };

  CODE.vraag = (tekst) => {
    const t = (tekst || '').trim();
    if (!t) return;
    CODE.agentStap(t);
    const titelMatch = t.match(/["“']([^"”']+)["”']/) || (/title|titel|header/i.test(t) && t.match(/to\s+(.+)$/i));
    if (titelMatch) {
      CODE.titel = titelMatch[1].trim();
      CODE.geaccepteerd = false;
      const inp = document.getElementById('inspect-titel');
      if (inp) inp.value = CODE.titel;
      CODE.ververs();
      CODE.agentStap('Header title → ' + CODE.titel, 'diff');
    } else if (/phone and tablet|every device|all device/i.test(t)) {
      CODE.zetStand('preview');
    } else if (/tablet|ipad/i.test(t)) {
      CODE.zetToestel('tablet');
      CODE.agentStap('Preview on iPad Pro 11', 'device');
    } else if (/desktop/i.test(t)) {
      CODE.zetToestel('desktop');
      CODE.agentStap('Preview on desktop frame', 'device');
    } else if (/phone|iphone|mobile/i.test(t)) {
      CODE.zetToestel('phone');
      CODE.agentStap('Preview on iPhone 15 Pro', 'device');
    } else if (/canvas|figma|artboard/i.test(t)) {
      CODE.zetStand('canvas');
    } else if (/preview/i.test(t)) {
      CODE.zetStand('preview');
    } else if (/\blight\b/i.test(t)) {
      CODE.look = 'Light';
      CODE.ververs();
    } else if (/\bdark\b/i.test(t)) {
      CODE.look = 'Dark';
      CODE.ververs();
    }
  };

  CODE.start = () => {
    const studio = document.querySelector('.studio');
    if (!studio) return;
    studio.dataset.stand = studio.dataset.stand || 'code';
    studio.dataset.toestel = studio.dataset.toestel || 'phone';
    studio.dataset.ontwerp = studio.dataset.ontwerp || 'aan';
    document.body.dataset.studioStand = studio.dataset.stand;
    document.querySelectorAll('[data-stand]').forEach((b) => {
      if (b.tagName === 'BUTTON') b.addEventListener('click', () => CODE.zetStand(b.dataset.stand));
    });
    document.querySelectorAll('[data-toestel]').forEach((b) => {
      if (b.tagName === 'BUTTON') b.addEventListener('click', () => CODE.zetToestel(b.dataset.toestel));
    });
    document.querySelectorAll('[data-ontwerp-knop]').forEach((ontwerp) => {
      ontwerp.addEventListener('click', () => CODE.zetOntwerp(studio.dataset.ontwerp !== 'aan'));
    });
    const q = new URLSearchParams(location.search);
    if (q.get('stand') === 'canvas' || q.get('stand') === 'preview' || q.get('stand') === 'code') {
      studio.dataset.stand = q.get('stand');
    }
    if (q.get('device') === 'tablet' || q.get('device') === 'desktop' || q.get('device') === 'phone') {
      studio.dataset.toestel = q.get('device');
    }
    CODE.ververs();
    CODE.zetStand(studio.dataset.stand);

    CODE.pasSchaal();
    if (window.ResizeObserver) new ResizeObserver(CODE.pasSchaal).observe(studio);

    document.querySelectorAll('[data-paneel]').forEach((b) => {
      b.addEventListener('click', () => {
        const naam = b.dataset.paneel;
        studio.dataset[naam] = studio.dataset[naam] === 'aan' ? 'uit' : 'aan';
        requestAnimationFrame(() => { CODE.pasSchaal(); requestAnimationFrame(CODE.pasSchaal); });
      });
    });
    document.querySelectorAll('[data-file]').forEach((rij) => {
      rij.addEventListener('click', () => CODE.zetBron(rij.dataset.file));
    });
    document.querySelectorAll('.lagen [data-laag]').forEach((rij) => {
      rij.addEventListener('click', () => CODE.zetLaag(rij.dataset.laag));
    });
    document.querySelectorAll('[data-apply]').forEach((b) => {
      b.addEventListener('click', () => {
        CODE.titel = (document.getElementById('inspect-titel')?.value || CODE.titel).trim();
        CODE.geaccepteerd = false;
        CODE.ververs();
        CODE.agentStap('Apply · ' + CODE.titel, 'diff');
      });
    });
    document.querySelectorAll('[data-naar-agent]').forEach((b) => {
      b.addEventListener('click', () => {
        CODE.vraag('set the header title to "' + (CODE.titel || 'Device manager') + '"');
      });
    });
    document.querySelector('[data-run]')?.addEventListener('click', () => {
      CODE.termRegel('npx vitest run --reporter=dot', '✓ 1025 passed · 0 failed');
    });
    document.querySelector('[data-ask]')?.addEventListener('click', () => {
      const inp = document.querySelector('.band .composer input.tekst');
      CODE.vraag((inp && inp.value) || 'put the device manager on phone and tablet');
    });
    document.querySelector('[data-term-stuur]')?.addEventListener('click', () => {
      const inp = document.getElementById('term-in');
      if (!inp || !inp.value.trim()) return;
      CODE.termRegel(inp.value.trim(), 'ok');
      inp.value = '';
    });
    document.getElementById('term-in')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.querySelector('[data-term-stuur]')?.click();
    });
    document.querySelector('[data-agent-stuur]')?.addEventListener('click', () => {
      const inp = document.getElementById('agent-in');
      if (!inp || !inp.value.trim()) return;
      CODE.vraag(inp.value);
      inp.value = '';
    });
    document.getElementById('agent-in')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.querySelector('[data-agent-stuur]')?.click();
    });
    document.querySelectorAll('[data-motor]').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('[data-motor]').forEach((x) => x.classList.toggle('aan', x === b));
      });
    });
    document.querySelectorAll('[data-herlaad]').forEach((b) => {
      b.addEventListener('click', () => CODE.ververs());
    });
    document.querySelectorAll('[data-kies-toestel]').forEach((plek) => {
      plek.addEventListener('click', () => {
        document.querySelectorAll('[data-kies-toestel]').forEach((p) => p.classList.toggle('aan', p === plek));
        CODE.zetToestel(plek.dataset.kiesToestel);
      });
    });
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-dm-tab]');
      if (tab) {
        CODE.paneel = tab.dataset.dmTab;
        CODE.ververs();
        return;
      }
      const look = e.target.closest('[data-dm-look]');
      if (look) {
        CODE.look = look.dataset.dmLook;
        CODE.ververs();
        return;
      }
      const laagEl = e.target.closest('[data-laag]');
      if (laagEl && !laagEl.closest('.lagen')) CODE.zetLaag(laagEl.dataset.laag);
    });
    const zoek = document.getElementById('file-zoek');
    if (zoek) {
      zoek.addEventListener('input', () => {
        const qv = zoek.value.toLowerCase();
        document.querySelectorAll('.boom [data-file]').forEach((r) => {
          r.style.display = !qv || r.dataset.file.toLowerCase().includes(qv) ? '' : 'none';
        });
      });
    }
    const titel = document.getElementById('inspect-titel');
    if (titel) {
      titel.addEventListener('input', () => {
        CODE.titel = titel.value || 'Device manager';
        document.querySelectorAll('.dm__titel').forEach((el) => { el.textContent = CODE.titel; });
      });
    }
    const span = document.querySelector('.band .composer .tekst');
    if (span && span.tagName !== 'INPUT') {
      const inp = document.createElement('input');
      inp.className = 'tekst';
      inp.placeholder = 'Ask anything. @models, prompts…';
      inp.setAttribute('aria-label', 'Ask anything');
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { CODE.vraag(inp.value); inp.value = ''; }
      });
      span.replaceWith(inp);
    }
    document.querySelector('.band .composer .stuur')?.addEventListener('click', () => {
      const inp = document.querySelector('.band .composer input.tekst');
      if (inp) { CODE.vraag(inp.value); inp.value = ''; }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.querySelector('.band .composer input.tekst')?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        CODE.accepteer();
      }
    });
  };
})();
