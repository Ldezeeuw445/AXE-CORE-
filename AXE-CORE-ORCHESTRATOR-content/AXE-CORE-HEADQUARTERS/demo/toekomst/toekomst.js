/* ═══════════════════════════════════════════════════════════════════════
   AXE CORE — toekomst: het gedeelde gedrag van de galerij.

   Vier dingen, en verder niets:
     1. de stand (glass / black), uit ?look= of de knop rechtsboven
     2. het bureaublad: één canvas dat een berglandschap schildert, zodat het
        glas iets te vervagen heeft (in de app doet macOS dit)
     3. de bol -- één op één de tekenlogica van AxeCoreSphere.tsx, zodat wat
        je hier ziet ook is wat de app tekent
     4. het chroom: bovenbalk, dok, chatplaat en composer als sjabloon, zodat
        elke pagina hetzelfde chroom heeft en niemand het overtypt
   Plus een greep om dingen te laten zweven.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const AXE = (window.AXE = {});

  /* ── 1. De stand ──────────────────────────────────────────────────────── */
  const params = new URLSearchParams(location.search);
  const startLook = params.get('look') === 'glass' ? 'glass' : (params.get('look') === 'black' ? 'black' : (localStorage.getItem('toekomst_look') || 'black'));
  document.documentElement.dataset.look = startLook;

  AXE.zetLook = (look) => {
    document.documentElement.dataset.look = look;
    try { localStorage.setItem('toekomst_look', look); } catch { /* privé */ }
    document.querySelectorAll('.look-wissel button').forEach(b => b.classList.toggle('aan', b.dataset.look === look));
    AXE.schilderBureaublad();
  };

  /* ── 2. Het bureaublad ────────────────────────────────────────────────── */
  // Een deterministische ruis, zodat het landschap bij elke lading gelijk is
  // en screenshots vergelijkbaar blijven.
  function ruis(zaad) {
    let s = zaad >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function bergkam(x, amp, freq, r) {
    let y = 0, a = amp, f = freq;
    for (let o = 0; o < 4; o++) { y += Math.sin(x * f + r * 9.7) * a + Math.sin(x * f * 2.3 + r * 3.1) * a * .35; a *= .5; f *= 2.1; }
    return y;
  }
  AXE.schilderBureaublad = () => {
    const c = document.getElementById('bureaublad');
    if (!c) return;
    const w = c.width = Math.round(c.clientWidth / 2), h = c.height = Math.round(c.clientHeight / 2);
    const x = c.getContext('2d');
    // Hetzelfde landschap in beide standen: de plaat bepaalt hoe het doorkomt.
    const lucht = x.createLinearGradient(0, 0, 0, h);
    lucht.addColorStop(0, '#6F8FB8'); lucht.addColorStop(.42, '#B9CDE2'); lucht.addColorStop(.62, '#8FB2CC'); lucht.addColorStop(1, '#2E6E7E');
    x.fillStyle = lucht; x.fillRect(0, 0, w, h);
    // Wolkenvlekken
    for (let i = 0; i < 6; i++) {
      const g = x.createRadialGradient(w * (.1 + i * .16), h * (.12 + (i % 3) * .07), 0, w * (.1 + i * .16), h * (.12 + (i % 3) * .07), w * .18);
      g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    // Vier bergkammen, van ver (licht) naar dichtbij (donker)
    const lagen = [
      { basis: .50, amp: .16, freq: 2.2, kleur: '#7E93AC', r: 1 },
      { basis: .56, amp: .19, freq: 3.1, kleur: '#4E6079', r: 2 },
      { basis: .64, amp: .15, freq: 4.4, kleur: '#2F3B4E', r: 3 },
      { basis: .72, amp: .10, freq: 6.0, kleur: '#1B2330', r: 4 },
    ];
    for (const l of lagen) {
      x.beginPath(); x.moveTo(0, h);
      for (let px = 0; px <= w; px += 3) {
        const y = h * l.basis - Math.abs(bergkam(px / w * 6.283, l.amp, l.freq, l.r)) * h;
        x.lineTo(px, y);
      }
      x.lineTo(w, h); x.closePath(); x.fillStyle = l.kleur; x.fill();
      // Sneeuw op de verre kammen
      if (l.r < 3) {
        x.save(); x.clip();
        const s = x.createLinearGradient(0, h * (l.basis - l.amp * 1.4), 0, h * (l.basis - l.amp * .5));
        s.addColorStop(0, 'rgba(240,246,255,.85)'); s.addColorStop(1, 'rgba(240,246,255,0)');
        x.fillStyle = s; x.fillRect(0, 0, w, h); x.restore();
      }
    }
    // Het meer: turquoise met een lichte spiegeling
    const meer = x.createLinearGradient(0, h * .74, 0, h);
    meer.addColorStop(0, '#2E8FA0'); meer.addColorStop(.5, '#1C7A8C'); meer.addColorStop(1, '#0E4E5E');
    x.fillStyle = meer; x.fillRect(0, h * .76, w, h * .24);
    const glans = x.createRadialGradient(w * .5, h * .86, 0, w * .5, h * .86, w * .35);
    glans.addColorStop(0, 'rgba(180,240,250,.35)'); glans.addColorStop(1, 'rgba(180,240,250,0)');
    x.fillStyle = glans; x.fillRect(0, h * .76, w, h * .24);
    // Bomen aan de rand, als donkere korrel
    const rnd = ruis(7);
    x.fillStyle = '#0F1A1C';
    for (let i = 0; i < 260; i++) { const bx = rnd() * w, by = h * (.70 + rnd() * .08); x.fillRect(bx, by, 2, 6 + rnd() * 10); }
  };

  /* ── 3. De bol (uit AxeCoreSphere.tsx) ────────────────────────────────── */
  const N = 2200;
  const PALET = [
    ...Array(64).fill('214,228,255'), ...Array(12).fill('34,211,238'),
    ...Array(5).fill('59,130,246'), ...Array(4).fill('167,139,250'),
    ...Array(3).fill('20,184,166'), ...Array(2).fill('245,159,36'),
  ];
  function maakBol() {
    const rnd = ruis(42);
    return Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      const g = (1 + y) / 2;
      const kleur = g < 0.42
        ? [Math.round(150 - g * 90), Math.round(230 - g * 40), Math.round(120 + g * 250)]
        : [Math.round(60 - (g - 0.42) * 40), Math.round(200 - (g - 0.42) * 150), Math.round(240 - (g - 0.42) * 30)];
      const afwijker = rnd() < 0.06;
      return { x: Math.cos(th) * rad, y, z: Math.sin(th) * rad, rgb: afwijker ? PALET[Math.floor(rnd() * PALET.length)] : kleur.join(',') };
    });
  }
  const BOL = maakBol();

  /** Tekent en draait de bol in een canvas. Geeft een stop-functie terug. */
  AXE.bol = (canvas, opties = {}) => {
    const x = canvas.getContext('2d');
    const stil = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const schaal = opties.schaal ?? 0.31;
    let w = 0, h = 0, d = 1, t = opties.t0 ?? 0, frame = 0;
    let rotY = opties.rotY ?? 0, rotX = 0.32, zoom = 1, auto = opties.auto ?? 0;
    let slepen = false, lastX = 0, lastY = 0;
    const fit = () => { const r = canvas.getBoundingClientRect(); d = Math.min(devicePixelRatio || 1, 2); w = canvas.width = Math.max(1, Math.round(r.width * d)); h = canvas.height = Math.max(1, Math.round(r.height * d)); };
    let cyv = 1, syv = 0, cxv = 1, sxv = 0;
    const stand = () => { const ry = rotY + auto; cyv = Math.cos(ry); syv = Math.sin(ry); cxv = Math.cos(rotX); sxv = Math.sin(rotX); };
    const proj = (p, cx, cy, R) => {
      const X = p.x * cyv - p.z * syv; let Z = p.x * syv + p.z * cyv;
      const Y = p.y * cxv - Z * sxv; Z = p.y * sxv + Z * cxv;
      const persp = 1.9 / (2.4 - Z);
      return { px: cx + X * R * persp, py: cy + Y * R * persp, depth: (Z + 1) / 2 };
    };
    const ringHelft = (cx, cy, R, voor) => {
      const straal = R * 0.74; x.lineWidth = Math.max(1, 1.15 * d); x.beginPath(); let begonnen = false;
      for (let i = 0; i <= 180; i++) {
        const a = (i / 180) * 6.2832, X0 = Math.cos(a), Z0 = Math.sin(a);
        const X = X0 * cyv - Z0 * syv; let Z = X0 * syv + Z0 * cyv; const Y = -Z * sxv; Z = Z * cxv;
        if ((Z > 0) !== voor) { begonnen = false; continue; }
        const persp = 1.9 / (2.4 - Z), px = cx + X * straal * persp, py = cy + Y * straal * persp;
        if (begonnen) x.lineTo(px, py); else x.moveTo(px, py); begonnen = true;
      }
      x.strokeStyle = voor ? 'rgba(212,196,86,.62)' : 'rgba(212,196,86,.26)'; x.stroke();
    };
    const teken = () => {
      if (!w) fit(); stand(); x.clearRect(0, 0, w, h);
      const b = opties.boost ?? 0, cx = w / 2, cy = h / 2, R = Math.min(w, h) * schaal * zoom;
      const puls = 1 + Math.sin(t * 1.6) * 0.03 + b * 0.08;
      const binnen = BOL.map(p => proj(p, cx, cy, R * 0.46 * puls));
      for (const q of binnen) { if (q.depth > 0.5) continue; x.fillStyle = `rgba(120,205,240,${(0.16 + q.depth * 0.52).toFixed(3)})`; x.beginPath(); x.arc(q.px, q.py, (0.7 + q.depth * 1.45) * d, 0, 6.284); x.fill(); }
      ringHelft(cx, cy, R, false);
      const wijd = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55 * puls);
      wijd.addColorStop(0, `rgba(110,200,240,${(0.18 + b * 0.1).toFixed(3)})`); wijd.addColorStop(0.45, 'rgba(60,130,190,.06)'); wijd.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = wijd; x.beginPath(); x.arc(cx, cy, R * 0.55 * puls, 0, 6.284); x.fill();
      const kern = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.12 * puls);
      kern.addColorStop(0, `rgba(240,252,255,${(0.72 + b * 0.25).toFixed(3)})`); kern.addColorStop(0.42, 'rgba(120,215,245,.30)'); kern.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = kern; x.beginPath(); x.arc(cx, cy, R * 0.12 * puls, 0, 6.284); x.fill();
      for (const q of binnen) { if (q.depth <= 0.5) continue; x.fillStyle = `rgba(150,228,255,${(0.20 + q.depth * 0.66).toFixed(3)})`; x.beginPath(); x.arc(q.px, q.py, (0.7 + q.depth * 1.55) * d, 0, 6.284); x.fill(); }
      for (const p of BOL) { const q = proj(p, cx, cy, R); const size = (0.85 + q.depth * 2.2) * d * (0.9 + b * 0.4); x.fillStyle = `rgba(${p.rgb},${(0.34 + q.depth * 0.66).toFixed(3)})`; x.beginPath(); x.arc(q.px, q.py, size, 0, 6.284); x.fill(); }
      ringHelft(cx, cy, R, true);
    };
    let vorige = 0; const INTERVAL = 1000 / 30;
    const lus = (nu) => {
      frame = requestAnimationFrame(lus);
      if (document.hidden) return;
      const verstreken = nu - vorige;
      if (!slepen && vorige && verstreken < INTERVAL) return;
      const stap = (!vorige || verstreken > 500) ? 1 : verstreken / (1000 / 60); vorige = nu;
      t += 0.016 * stap; if (!slepen) auto += 0.0016 * stap; teken();
    };
    canvas.addEventListener('pointerdown', e => { slepen = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); e.stopPropagation(); });
    canvas.addEventListener('pointermove', e => { if (!slepen) return; rotY += (e.clientX - lastX) * 0.006; rotX = Math.max(-1.3, Math.min(1.3, rotX + (e.clientY - lastY) * 0.006)); lastX = e.clientX; lastY = e.clientY; });
    canvas.addEventListener('pointerup', () => { slepen = false; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.55, Math.min(2.6, zoom * (e.deltaY < 0 ? 1.08 : 0.926))); }, { passive: false });
    canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
    fit(); teken();
    if (!stil) frame = requestAnimationFrame(lus);
    new ResizeObserver(() => { fit(); teken(); }).observe(canvas);
    return () => cancelAnimationFrame(frame);
  };

  /* ── Zweven ───────────────────────────────────────────────────────────── */
  /** Maakt een element sleepbaar binnen het venster; onthoudt zijn plek. */
  AXE.zweefbaar = (el, sleutel, greep) => {
    const bewaard = (() => { try { return JSON.parse(localStorage.getItem('toekomst_' + sleutel) || 'null'); } catch { return null; } })();
    if (bewaard && !params.has('reset')) { el.style.left = bewaard.x + 'px'; el.style.top = bewaard.y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; }
    const handvat = greep || el;
    let start = null;
    handvat.addEventListener('pointerdown', e => {
      if (e.target.closest('canvas, button, input')) return;
      const r = el.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      el.classList.add('sleept'); handvat.setPointerCapture(e.pointerId);
      el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
    });
    handvat.addEventListener('pointermove', e => {
      if (!start) return;
      const r = el.getBoundingClientRect();
      const nx = Math.max(8, Math.min(innerWidth - r.width - 8, start.l + e.clientX - start.x));
      const ny = Math.max(8, Math.min(innerHeight - r.height - 8, start.t + e.clientY - start.y));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
    });
    const los = () => {
      if (!start) return; start = null; el.classList.remove('sleept');
      try { localStorage.setItem('toekomst_' + sleutel, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })); } catch { /* privé */ }
    };
    handvat.addEventListener('pointerup', los); handvat.addEventListener('pointercancel', los);
  };

  /* ── 4. Iconen (lucide-achtig, 24-raster) ─────────────────────────────── */
  const P = {
    home: '<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>',
    lamp: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    raster: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    brein: '<path d="M9.5 3a3 3 0 0 0-3 3 3 3 0 0 0-2.5 5 3 3 0 0 0 1 5.5A3 3 0 0 0 9.5 21c1 0 2-.5 2.5-1.3V4.3A3 3 0 0 0 9.5 3zM14.5 3a3 3 0 0 1 3 3 3 3 0 0 1 2.5 5 3 3 0 0 1-1 5.5A3 3 0 0 1 14.5 21c-1 0-2-.5-2.5-1.3V4.3A3 3 0 0 1 14.5 3z"/>',
    kluis: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 10v2l1.5 1.5"/>',
    boek: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    stekker: '<path d="M12 22v-5M9 8V2M15 8V2M6 8h12v4a6 6 0 0 1-12 0z"/>',
    server: '<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 6.5h.01M6 17.5h.01"/>',
    schuif: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    tabel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
    klok: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    kompas: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M8 4h8M9 14h.01M15 14h.01M2 13v3M22 13v3"/>',
    mensen: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/>',
    kalender: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    vink: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>',
    beurs: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>',
    grafiek: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    terminal: '<path d="M4 17l6-5-6-5M12 19h8"/>',
    vonk: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    tandwiel: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    golf: '<path d="M2 12h2l2-6 3 12 3-9 3 6 2-3h5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    luid: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    beeld: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5-9 9"/>',
    pijl: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    zoek: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    bel: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
    maan: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    driehoek: '<path d="M12 3l9 16H3z"/>',
    schild: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    ster: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    bestand: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    map: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tak: '<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 7.5v9M18 11.5a6 6 0 0 1-6 6H8.5"/>',
    speel: '<path d="M6 4l14 8-14 8z"/>',
    herlaad: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
    telefoon: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
    tablet: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M12 17.5h.01"/>',
    monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    kruis: '<path d="M18 6L6 18M6 6l12 12"/>',
    sleutel: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8L20 3M15 6l3 3M17 4l3 3"/>',
    oog: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    speld: '<path d="M12 17v5M8 8l-2 6h12l-2-6M9 3h6l-1 5h-4z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/>',
    beweeg: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    muis: '<path d="M4 4l7 16 2-7 7-2z"/>',
    tekst: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    penseel: '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    schakel: '<path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/>',
    hart: '<path d="M12 21s-7-4.6-9-9.2C1.6 8.4 3.6 5 7 5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.4 0 5.4 3.4 4 6.8-2 4.6-9 9.2-9 9.2z"/>',
  };
  AXE.ic = (naam, klasse = '') => `<svg class="ic ${klasse}" viewBox="0 0 24 24" aria-hidden="true">${P[naam] || P.ster}</svg>`;

  /* ── Het chroom ───────────────────────────────────────────────────────── */
  const DOK = [
    ['home', 'Home'], ['lamp', 'THINKTHANKS'], ['raster', 'Apps'], ['cpu', 'AI Core'], ['brein', 'Memory'], ['kluis', 'Obsidian'],
    ['boek', 'Knowledge'], ['stekker', 'MCP'], ['server', 'Infrastructure'], ['schuif', 'Control Plane'], ['tabel', 'Table Editor'], ['klok', 'Cron'],
    null,
    ['kompas', 'Browser'], ['bot', 'Agents'], ['mensen', 'CrewAI'], ['kalender', 'Calendar'], ['vink', 'Tasks'], ['beurs', 'Finance'],
    ['grafiek', 'Trading Intel'], ['globe', '3D Maps'], ['code', 'Code Editor'], ['terminal', 'Terminals'], ['vonk', 'EVE'], ['tandwiel', 'Settings'],
  ];

  AXE.topbalk = (o = {}) => {
    const segs = o.segmenten ?? [['Core', 'home'], ['Neural', 'brein'], ['Terrain', 'layers'], ['Architecture', 'tak']];
    const aan = o.segment ?? 'Core';
    const nu = new Date();
    const klok = `${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}:${String(nu.getSeconds()).padStart(2, '0')}`;
    return `
      <div class="topbalk__links">
        <span class="status c-accent">${AXE.ic('driehoek')} Command Center</span>
        <span class="status c-ok"><i class="stip"></i> Optimal</span>
        <span class="status c-accent">Core Active</span>
        ${o.links ?? ''}
      </div>
      <div class="segmenten">
        <button class="seg seg--kern"><i class="stip"></i> AXE Core</button>
        ${segs.map(([l, i]) => `<button class="seg ${l === aan ? 'seg--aan' : ''}">${AXE.ic(i)} ${l}</button>`).join('')}
      </div>
      <div class="topbalk__rechts">
        ${o.rechts ?? ''}
        <span class="klok">${klok}</span>
        <span class="t-label">Friday, September 11, 2026</span>
        <span class="status c-amber">${AXE.ic('grafiek')} Trending</span>
        <button class="knop knop--rond">${AXE.ic('zoek')}</button>
        <button class="knop knop--rond">${AXE.ic('bel')}</button>
        <button class="knop knop--rond">${AXE.ic('maan')}</button>
        <span class="look-wissel">
          <button data-look="glass" class="${document.documentElement.dataset.look === 'glass' ? 'aan' : ''}" onclick="AXE.zetLook('glass')">Glass</button>
          <button data-look="black" class="${document.documentElement.dataset.look === 'black' ? 'aan' : ''}" onclick="AXE.zetLook('black')">Black</button>
        </span>
        <span class="avatar"></span>
      </div>`;
  };

  AXE.dok = (actief = 'Home') => `
    ${DOK.map(t => t === null
      ? `<button class="tab stem" title="Voice">${AXE.ic('golf')}</button>`
      : `<button class="tab ${t[1] === actief ? 'tab--aan' : ''}" title="${t[1]}">${AXE.ic(t[0])}</button>`).join('')}`;

  AXE.chatplaat = (o = {}) => `
    <div class="chatplaat ${o.open ? 'chatplaat--open' : ''} ${o.dicht ? 'chatplaat--dicht' : ''} ${o.werkt ? 'kaart--werkt' : ''}">
      <div class="chatplaat__kop">
        <span class="naam">▸ AXE CHAT</span>
        <span class="chip">${AXE.ic('bot')} 1 agent</span>
        <span class="chip">${AXE.ic('mic')} AI Voice</span>
        <span class="chip">ChatGPT · axecompanion ${AXE.ic('pijl')}</span>
        <span class="chip c-ok"><i class="stip"></i> Memory · 19 038</span>
        <span class="rechts"><span>command · files</span><span>voice · agents · lens</span><span class="c-accent">new</span></span>
      </div>
      ${o.inhoud ?? `<div class="chatplaat__leeg"><span>"show chart"</span>·<span>"show me New York"</span>·<span>"drop files"</span>·<span>"voice"</span></div>`}
    </div>`;

  AXE.composer = (tekst = 'show chart · show me New York', o = {}) => `
    <div class="composer ${o.klasse ?? ''}">
      <span class="c-accent">▸</span>
      <button class="knop knop--rond">${AXE.ic('tandwiel')}</button>
      <button class="knop knop--rond">${AXE.ic('luid')}</button>
      <button class="knop knop--rond c-accent">${AXE.ic('mic')}</button>
      <button class="knop knop--rond">${AXE.ic('plus')}</button>
      <button class="knop knop--rond">${AXE.ic('beeld')}</button>
      <span class="tekst">${tekst}<i class="cursor"></i></span>
      <button class="knop stuur">${AXE.ic('pijl')}</button>
    </div>`;

  /** Het mobiele AXE-scherm, in een toestel. Geeft de canvas terug voor de bol. */
  AXE.mobiel = (o = {}) => `
    <div class="mobiel">
      <div class="mobiel__status"><span>23:08</span><span class="rechts"><span>●●●</span><span>5G</span><span style="display:inline-block;width:22px;height:11px;border:1.5px solid currentColor;border-radius:3px;position:relative"><span style="position:absolute;inset:1.5px;right:4px;background:var(--ok);border-radius:1px"></span></span></span></div>
      <div class="mobiel__body">
        <div class="mobiel__bol"><canvas data-bol data-schaal="0.42"></canvas>
          <div style="position:absolute;left:0;right:0;bottom:6px;text-align:center" class="t-label">${o.status ?? 'core active · 19 038 memories'}</div></div>
        <div class="mobiel__chat">
          <div class="bubbel bubbel--ik">Show me XAUUSD on the 15m</div>
          <div class="bubbel bubbel--axe"><b>XAUUSD</b> · 4 346.46 · London open in 12 min. Golden Pocket is holding; SMC bias stays long above 4 338.</div>
        </div>
      </div>
      <div class="mobiel__onder">
        <div class="mobiel__composer">${AXE.ic('mic')} Ask AXE anything<span class="stuur">${AXE.ic('pijl')}</span></div>
        <div class="mobiel__dok">
          <span class="tab tab--aan">${AXE.ic('home')}</span><span class="tab">${AXE.ic('grafiek')}</span><span class="tab">${AXE.ic('bot')}</span><span class="tab">${AXE.ic('kompas')}</span><span class="tab">${AXE.ic('tandwiel')}</span>
        </div>
      </div>
    </div>`;

  /* ── Opstarten ────────────────────────────────────────────────────────── */
  AXE.start = (o = {}) => {
    document.querySelectorAll('[data-chroom="topbalk"]').forEach(el => { el.innerHTML = AXE.topbalk(o.topbalk); });
    document.querySelectorAll('[data-chroom="dok"]').forEach(el => { el.innerHTML = AXE.dok(o.dok); });
    document.querySelectorAll('[data-chroom="chatplaat"]').forEach(el => { el.outerHTML = AXE.chatplaat(o.chat); });
    document.querySelectorAll('[data-chroom="composer"]').forEach(el => { el.outerHTML = AXE.composer(el.dataset.tekst, { klasse: el.className }); });
    document.querySelectorAll('[data-chroom="mobiel"]').forEach(el => { el.innerHTML = AXE.mobiel(); });
    document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = AXE.ic(el.dataset.ic) + el.innerHTML; });
    AXE.schilderBureaublad();
    document.querySelectorAll('canvas[data-bol]').forEach(c => AXE.bol(c, { schaal: parseFloat(c.dataset.schaal || '0.31'), rotY: parseFloat(c.dataset.roty || '0'), t0: parseFloat(c.dataset.t0 || '0') }));
    document.querySelectorAll('[data-zweef]').forEach(el => AXE.zweefbaar(el, el.dataset.zweef, el.querySelector('[data-greep]')));
    addEventListener('resize', AXE.schilderBureaublad);
  };
})();
