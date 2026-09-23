/* ═══════════════════════════════════════════════════════════════════════
   AXE CORE — toekomst / mobiel: het chroom van de telefoon.

   Leunt op ../toekomst.js (AXE.ic, AXE.bol, AXE.start) en voegt alleen toe
   wat de telefoon eigen heeft: het Galaxy-toestel, de Android-statusbalk,
   de AXE-band onderin (chips, composer met stem-orb, dok van vijf) en de
   gebarenbalk. Elke pagina schrijft zijn schermen uit en laat dit bestand
   het herhaalwerk invullen, zodat de vijf dokken en de acht statusbalken
   niet uit elkaar kunnen lopen.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const MOB = (window.MOB = {});

  /* De vijf tabs van de telefoon. Minder dan de 25 van de desktop, met opzet:
     alles wat op de desktop een tab is, is hier een kaart binnen een van deze
     vijf. Wat hij op de desktop kan, kan hij hier -- alleen anders geordend. */
  MOB.DOK = [
    ['telefoon', 'Device', 'device.html'],
    ['bot', 'Chat', 'chat.html'],
    ['cpu', 'Core', 'werk.html'],
    ['stekker', 'Link', 'verbinding.html'],
    ['tandwiel', 'Settings', 'instellingen.html'],
  ];

  /** Het toestel om een scherm heen. `inhoud` is het scherm (.sam of .slot). */
  MOB.galaxy = (inhoud, o = {}) => `
    <div class="galaxy ${o.actief ? 'galaxy--actief' : ''}">
      <span class="galaxy__knop galaxy__knop--vol"></span><span class="galaxy__knop galaxy__knop--aan"></span>
      <div class="galaxy__scherm">
        <span class="galaxy__camera"></span>
        ${inhoud}
      </div>
    </div>`;

  /** De statusbalk van Android: tijd links, radio en accu rechts. */
  MOB.status = (o = {}) => `
    <span>${o.tijd ?? '23:08'}</span>
    <span class="rechts">
      ${o.stil ? AXE.ic('maan') : ''}
      <span>${o.net ?? '5G'}</span>
      <span>●●●●</span>
      <span class="accu ${o.laag ? 'accu--laag' : ''}"></span>
    </span>`;

  MOB.dok = (actief = 'Device') => MOB.DOK.map(([ic, naam, href]) =>
    `<a class="tab ${naam === actief ? 'tab--aan' : ''}" href="${href}"><span class="rond">${AXE.ic(ic)}</span><span>${naam}</span></a>`).join('');

  /** De composer: tekst, dan de stem-orb (violet), dan sturen. */
  MOB.composer = (o = {}) => `
    <div class="sam__composer">
      <button class="knop knop--rond">${AXE.ic('plus')}</button>
      <span class="tekst ${o.tekst ? 'aan' : ''}">${o.tekst ?? 'Ask AXE anything'}${o.tekst ? '<i class="cursor"></i>' : ''}</span>
      <span class="orb ${o.luistert ? 'orb--aan' : ''}">${AXE.ic('mic')}</span>
      <span class="stuur">${AXE.ic('pijl')}</span>
    </div>`;

  /** De hele band onderin: eventueel chips, de composer, het dok, de gebarenbalk. */
  MOB.onder = (o = {}) => `
    ${o.chips ? `<div class="sam__chips">${o.chips}</div>` : ''}
    ${o.composer === false ? '' : MOB.composer(o)}
    <div class="sam__dok">${MOB.dok(o.actief)}</div>
    <span class="sam__gebaar"></span>`;

  /* Een QR-achtig blok, deterministisch, alleen als illustratie. De drie
     zoekvierkanten staan waar een echte QR ze heeft; de rest is ruis. */
  MOB.qr = (zaad = 11) => {
    let s = zaad >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const N = 21, cel = [];
    const vierkant = (x0, y0, x, y) => { const dx = x - x0, dy = y - y0; if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null; const rand = dx === 0 || dy === 0 || dx === 6 || dy === 6; const kern = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4; return rand || kern; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const z = vierkant(0, 0, x, y) ?? vierkant(N - 7, 0, x, y) ?? vierkant(0, N - 7, x, y);
      const aan = z !== null ? z : rnd() < 0.44;
      cel.push(`<i class="${aan ? '' : 'leeg'}"></i>`);
    }
    return cel.join('');
  };

  /** Vult de sjablonen en start daarna het gedeelde gedrag van de galerij. */
  MOB.start = (o = {}) => {
    // Eerst het toestel om het scherm heen; de sjablonen erin worden daarna gevuld.
    document.querySelectorAll('[data-mob="galaxy"]').forEach(el => { el.innerHTML = MOB.galaxy(el.innerHTML, { actief: 'actief' in el.dataset }); });
    document.querySelectorAll('[data-mob="status"]').forEach(el => {
      el.innerHTML = MOB.status({ tijd: el.dataset.tijd, net: el.dataset.net, laag: 'laag' in el.dataset, stil: 'stil' in el.dataset });
    });
    document.querySelectorAll('[data-mob="onder"]').forEach(el => {
      el.innerHTML = MOB.onder({
        actief: el.dataset.actief ?? o.tab ?? 'Device',
        tekst: el.dataset.tekst,
        luistert: 'luistert' in el.dataset,
        chips: el.dataset.chips ? el.dataset.chips.split('|').map(c => {
          const [ic, tekst, aan] = c.split(':');
          return `<span class="chip ${aan ? 'chip--aan' : ''}">${AXE.ic(ic)} ${tekst}</span>`;
        }).join('') : '',
        composer: !('geencomposer' in el.dataset),
      });
    });
    document.querySelectorAll('[data-mob="qr"]').forEach(el => { el.innerHTML = MOB.qr(parseInt(el.dataset.zaad || '11', 10)); });
    AXE.start(o);
  };
})();
