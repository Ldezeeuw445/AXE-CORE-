/* Code studio — standen, toestellen, de demo-pagina in een kader. */
(function () {
  'use strict';
  const CODE = (window.CODE = {});

  const TOESTEL = {
    phone: { naam: 'iPhone 15 Pro', maat: '393 × 852 @3x', w: 393, h: 852, klasse: 'iphone' },
    tablet: { naam: 'iPad Pro 11', maat: '820 × 1180 @2x', w: 820, h: 1180, klasse: 'ipad' },
    desktop: { naam: 'Desktop', maat: '1280 × 800', w: 1280, h: 800, klasse: 'deskframe' },
  };

  CODE.demoPagina = (vorm = 'phone') => {
    const extra = vorm === 'tablet' ? ' dm--tablet' : vorm === 'desktop' ? ' dm--desktop' : '';
    const dok = (aan) => ['Device', 'Use', 'Core', 'Tabs', 'Look']
      .map((n, i) => {
        const ic = ['telefoon', 'cpu', 'kompas', 'raster', 'tandwiel'][i];
        return `<span class="tab ${n === aan ? 'aan' : ''}"><span class="rond">${AXE.ic(ic)}</span>${n}</span>`;
      }).join('');
    const live = `<span class="rechts" style="color:var(--ok)"><i class="stip"></i> live</span>`;
    return `
      <div class="dm${extra}">
        <header class="dm__kop">
          <div><div class="dm__merk">AXE Core</div><div class="dm__titel">Device manager</div></div>
          <div class="dm__look"><span>Light</span><span class="aan">Dark</span></div>
        </header>
        <main class="dm__lijf">
          <section class="dm-kaart${vorm !== 'phone' ? ' dm-kaart--breed' : ''}">
            <h2>This phone · AXE Core ${live}</h2>
            <div class="groot">19 038</div>
            <p class="log">memories on this account</p>
            <div class="dm-rij"><span><i class="stip c-ok"></i> 8 open</span><span><i class="stip c-accent"></i> 3 agents</span></div>
          </section>
          <section class="dm-kaart">
            <h2>Link</h2>
            <div class="dm-regel"><span>Mac worker</span><span class="w c-ok">Mac Mini</span><small>computer use · axe-computer-worker</small></div>
            <div class="dm-regel"><span>VPS</span><span class="w">api.axecompanion.com</span><small>every provider call goes through here</small></div>
          </section>
          <section class="dm-kaart">
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
          </section>` : ''}
        </main>
        <nav class="dm__dok">${dok('Device')}</nav>
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
      const s = Math.max(0.2, Math.min((r.height - 120) / t.h, (r.width - 48) / t.w));
      kader.style.setProperty('--schaal', s.toFixed(3));
    }
    if (stand === 'preview') {
      const rij = document.querySelector('.rij-toestellen');
      if (!rij) return;
      const R = rij.getBoundingClientRect();
      const maxH = Math.max(180, R.height - 96);
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
    CODE.zetToestel(studio.dataset.toestel);
    document.querySelectorAll('[data-preview-schaal]').forEach((el) => {
      const soort = el.dataset.previewSchaal;
      const pagina = CODE.demoPagina(soort === 'tablet' ? 'tablet' : soort === 'desktop' ? 'desktop' : 'phone');
      const kader = soort === 'tablet' ? CODE.ipad(pagina) : soort === 'desktop' ? CODE.desk(pagina) : CODE.iphone(pagina);
      el.innerHTML = `<div class="toestel">${kader}</div>`;
    });
    const q = new URLSearchParams(location.search);
    if (q.get('stand') === 'canvas' || q.get('stand') === 'preview' || q.get('stand') === 'code') {
      CODE.zetStand(q.get('stand'));
    }
    if (q.get('device') === 'tablet' || q.get('device') === 'desktop' || q.get('device') === 'phone') {
      CODE.zetToestel(q.get('device'));
    }
    CODE.pasSchaal();
    new ResizeObserver(CODE.pasSchaal).observe(studio);
  };
})();
