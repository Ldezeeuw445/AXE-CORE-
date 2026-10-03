import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const bron = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('canonical mobile Home wiring', () => {
  it('owns one phone Home instead of stacking desktop plate controls on top', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(shell).toContain('!mobileCommandSurface && opPlaat && !volScherm && <PlaatViewSwitch />');
    expect(shell).toContain('!mobileCommandSurface && opPlaat && !volScherm && <PlaatChat />');
  });


  it('renders the /mobile route on the same floating glass plate as native phone tabs', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(shell).toContain("location.pathname !== '/lock'");
    expect(shell).toContain("const opPlaatMobiel = mobileNav");
  });

  it('gives the mobile mic a real primary native control instead of the desktop transparent-button style', () => {
    const composer = bron('presentation/components/layout/MobileComposer.tsx');
    const css = bron('design/axe-look.css');
    expect(composer).toContain('className="axe-mobile-mic"');
    expect(css).toContain('.axe-mobile-home .axe-vak-rij .axe-mobile-mic');
    expect(css).toContain("font-size: 16px");
  });


  it('centers the phone world switch between equal left and right control reserves', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    expect(mobile).toContain("gridTemplateColumns: '58px minmax(0, 1fr) 58px'");
  });

  it('keeps navigation hamburger tap-only and gives edge swipes to both AXE side drawers', () => {
    const nav = bron('presentation/components/layout/MobileNav.tsx');
    const chrome = bron('presentation/components/layout/AxeShellChrome.tsx');
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(nav).not.toContain("window.addEventListener('touchstart'");
    expect(chrome).toContain("raakDoel = 'open-l'");
    expect(chrome).toContain("raakDoel = 'open-r'");
    expect(chrome).toContain('ui.setLeftDrawerOpen(true)');
    expect(chrome).toContain('ui.setRightDrawerOpen(true)');
    expect(shell).toContain("<Sidebar />");
    expect(shell).toContain("<RightPanel />");
  });

  it('keeps the composer on the mobile safe-area floor and makes agent tiles more compact', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    expect(shell).toContain("paddingTop: 10");
    expect(mobile).toContain('size={23}');
    expect(mobile).toContain("gridTemplateColumns: 'clamp(52px, 15.2vw, 58px)");
  });


  it('uses icon-only matte world controls and smaller real agent avatars', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    const chat = bron('presentation/components/layout/MobileChat.tsx');
    expect(mobile).toContain('<span className="sr-only">{label}</span>');
    expect(mobile).toContain('size={23}');
    expect(chat).toContain('size={20}');
    expect(mobile).toContain('axe-mobile-worldbar');
  });

  it('shares one horizontal edge for agent grid, chat and composer', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    const css = bron('design/axe-look.css');
    expect((mobile.match(/axe-mobile-edge/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(css).toContain('.axe-mobile-home .axe-mobile-edge');
  });

  it('extends the mobile glass plate down to just above the iPhone home indicator', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(shell).toContain("calc(env(safe-area-inset-top, 0px) + 2px)");
    // De bodem stond ooit per route anders; sinds de plaat de basis van ELKE
    // mobiele tab is, is hij overal gelijk. Die splitsing hoort hier niet meer.
    // 34pt inset - 12 = 22pt boven de schermrand, 9pt boven de streep;
    // zonder inset (zwevende telefoon in Tauri) de oude 14px.
    expect(shell).toContain("max(14px, calc(env(safe-area-inset-bottom, 0px) - 12px))");
    expect(shell).not.toContain("'calc(env(safe-area-inset-bottom, 0px) + 14px)'");
  });

  it('labels the sphere with one small line: green dot + AXE CORE where READY was', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    expect(mobile).not.toContain('text-[14px] font-medium tracking-[0.16em]');
    expect(mobile).not.toContain('stateLabel');
    // Eén regel, klein, met een bolletje ervoor. Als losse beweringen in
    // plaats van één venster-regex: die brak op elke regel die ertussen kwam,
    // terwijl de bedoeling (klein, gekleurd bolletje, AXE CORE) gelijk bleef.
    expect(mobile).toContain('text-[9px] tracking-[0.12em]');
    expect(mobile).toContain('AXE CORE ·');
    // Groen uit een token, niet uit een hardgecodeerde hex -- kleur hoort in
    // een token zodat beide standen hem kunnen herzien.
    expect(mobile).toContain('var(--success)');
    expect(mobile).not.toContain('#34d399');
  });

  // Terrain staat absolute; zonder rand om het vak lag zijn canvas over de
  // wereldknoppen en kon je na één keer Terrain niet meer wisselen (28 sep).
  it('keeps every world inside its own layer and the world switch above it', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    expect(mobile).toContain('<PlaatSlot slot="wereld">');
    expect(mobile).toContain('<div className="relative isolate h-full w-full" style={view === \'runtime\' ? ARCHITECTUUR_VRIJ : undefined}>');
    expect(mobile).toContain('className="relative z-[5] mb-2 grid w-full flex-none items-center"');
  });

  // Luka, 28 sep: op de telefoon vult de wereld de hele plaat, en de zijwidgets
  // van Neural en Terrain staan in de laden. Desktop houdt zijn eigen sloten.
  it('fills the whole plate with the world and lets touches through to it', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    expect(shell).toContain('id={SLOT_ID.wereld}');
    expect(shell).toContain("const telefoonHome = opPlaatMobiel && location.pathname === '/mobile';");
    expect(shell).toContain("pointerEvents: mobielWereld ? 'none' : undefined");
    expect(mobile).toContain("pointerEvents: wereld ? 'none' : undefined");
    // De weg terug en de composer blijven aantikbaar.
    expect((mobile.match(/pointerEvents: 'auto'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  // Luka, 28 sep: brein en terrein in het midden van de vrije ruimte, niet te
  // ingezoomd, en nog te draaien en te zoomen.
  it('centres the 3D worlds in the free space and fits them on a portrait phone', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    const brein = bron('presentation/components/axe-core/NeuralBrain.tsx');
    const terrein = bron('presentation/components/axe-core/terrain/MemoryTerrainMap.tsx');
    expect(mobile).toContain("slot.style.setProperty('--wereld-vrij-boven', `${boven}px`);");
    expect(mobile).toContain("slot.dispatchEvent(new Event('wereldvrij'));");
    for (const wereld of [brein, terrein]) {
      expect(wereld).toContain('leesVrijeRuimte(');
      // `beeldVerschuiving` telt de vrije-ruimte-centrering op bij de vaste
      // lift, zodat de wereld ook op de plaat, de iPad en Tauri wat hoger
      // hangt -- daar was de verschuiving altijd 0.
      expect(wereld).toContain('beeldVerschuiving(');
      expect(wereld).toContain('pasAfstand(');
    }
    // Neural kon op de telefoon niet zoomen: alleen het scrollwiel.
    expect(brein).toContain("if (e.pointerType !== 'touch') return;");
    expect(brein).toContain("if (leesVrijeRuimte(root)) canvas.style.touchAction = 'none';");
  });

  // Luka, 28 sep: op de telefoon hubs als icoon (net als Terrain), de zoekbalk
  // even groot als de wereldbalk met alleen "Search Memories", en de hubkaart
  // in de rechterlade in plaats van half achter de composer.
  it('keeps Neural calm on the phone: icon hubs, bar-sized search, hub card in the right drawer', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    const brein = bron('presentation/components/axe-core/NeuralBrain.tsx');
    const css = bron('presentation/components/axe-core/NeuralBrain.css');
    expect(mobile).toContain("slot.style.setProperty('--wereld-balk-breedte'");
    expect(brein).toContain("zoek.placeholder = 'Search Memories';");
    expect(brein).toContain("rechts.prepend(kaart);");
    // Alleen in het wereldslot: desktop houdt namen, zoekbalk en kaart.
    expect(css).toContain('#axe-slot-wereld .axe-neural-root .hub-label-text{ display:none; }');
    expect(css).toContain('width:var(--wereld-balk-breedte, 176px);');
    expect(css).toContain('#axe-slot-wereld .axe-neural-root #composer .nb-mic-ico{ display:none; }');
    expect(css).toContain('.axe-slot #hub-info{ display:none;');
    expect(css).not.toMatch(/^\.axe-neural-root \.hub-label-text/m);
  });

  it('moves the side widgets of a world into the phone drawers, not on desktop', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    const links = bron('presentation/components/layout/Sidebar.tsx');
    const rechts = bron('presentation/components/layout/RightPanel.tsx');
    const lade = bron('presentation/components/layout/ladeSloten.ts');
    const css = bron('design/axe-look.css');
    // `ladeOppervlak` = telefoon OF iPad. Eén vlag, want de desktop-sloten en
    // de ladesloten vechten anders om dezelfde id's (ladeSloten.ts slaat bij
    // botsing alleen maar over, en dan krijg je stil geen lade).
    expect(shell).toContain("useLadeSloten(ladeOppervlak && location.pathname !== '/lock');");
    expect(shell).toContain('const ladeOppervlak = mobileCommandSurface || isTablet;');
    expect(shell).toContain('{!ladeOppervlak && opPlaat && <PlaatSlotHosts />}');
    // Sidebar/RightPanel gebruiken dezelfde vlag als hun Sheet: een lade die
    // opengaat zonder LadeSlot erin is een lege lade.
    expect(links).toContain('{isCompact && <LadeSlot naam="links" />}');
    expect(rechts).toContain('{isCompact && <LadeSlot naam="rechts" />}');
    for (const bestand of [links, rechts]) {
      expect(bestand).toContain('const isCompact = isMobile || isTablet;');
    }
    // Geparkeerd buiten React, zodat een dichte Sheet de widgets niet meeneemt.
    expect(lade).toContain("el.className = 'axe-slot axe-slot--lade';");
    expect(lade).toContain('parkeerplaats().appendChild(gastheer);');
    expect(css).toContain(':root[data-look] .axe-slot.axe-slot--lade {');
    expect(css).toContain(':root[data-look] .axe-slot.axe-slot--lade > .nm-sidebar {');
  });

  // Op de telefoon was de bol een waas: DPR begrensd op 2 op een 3x-scherm, en
  // deeltjes tot 7pt breed op 4,5pt van elkaar (28 sep). Alleen de telefoon-Home
  // zet de fijne modus aan; desktop, Tauri en de zwevende bol niet.
  it('draws the phone sphere at full 3x resolution with spacing-scaled particles', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    const bol = bron('presentation/components/axe-core/sphere/AxeCoreSphere.tsx');
    // 2 okt: de telefoon-Home kreeg TelefoonSphere (WebGL, op de schermpixels).
    // AxeCoreSphere telefoon blijft de terugval zonder WebGL.
    const telefoon = bron('presentation/components/axe-core/sphere/TelefoonSphere.tsx');
    expect(mobile).toContain('<TelefoonSphere />');
    expect(mobile).not.toContain('<AxeCoreSphere telefoon />');
    expect(telefoon).toContain('d = Math.min(window.devicePixelRatio || 1, 3);');
    expect(telefoon).toContain('if (!webgl) return <AxeCoreSphere telefoon />;');
    // 3 okt: één bol op beide platen, strak rond in rijen; alleen de kleur
    // volgt de look (donker van altijd, licht goud).
    expect(telefoon).toContain("attributeFilter: ['data-look']");
    expect(telefoon).toContain('const st = STIJL[plaat];');
    expect(telefoon).toContain('maakSchil(rs, plaat)');
    expect(bol).toContain('d = Math.min(window.devicePixelRatio || 1, telefoon ? 3 : 2);');
    expect(bol).toContain('const tekenNu = telefoon ? tekenFijn : teken;');
    for (const plek of ['pages/Home.tsx', 'pages/HomeStage.tsx', 'components/layout/zweef/ZwevendeBol.tsx', 'components/devices/TelefoonScherm.tsx']) {
      expect(bron(`presentation/${plek}`)).not.toContain('<AxeCoreSphere telefoon');
      expect(bron(`presentation/${plek}`)).not.toContain('<TelefoonSphere');
    }
  });

  it('shows six real roster agents around the Core', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    for (const id of ['trading', 'developer', 'thinktank', 'northsea', 'wingman', 'companion']) {
      expect(mobile).toContain(`'${id}'`);
    }
    expect(mobile).not.toContain("'analyst'");
    expect(mobile).not.toContain("'creative'");
    expect(mobile).not.toContain("'operator'");
  });

  it('includes the Core return button alongside Neural Terrain Architecture in the phone world switch', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
    expect(mobile).toContain("label: 'AXE Core sphere'");
    expect(mobile).toContain("label: 'Neural'");
    expect(mobile).toContain("label: 'Terrain'");
    expect(mobile).toContain("label: 'Architecture'");
  });

  it('uses the real AXE composer and the canonical voice store on phone', () => {
    const composer = bron('presentation/components/layout/MobileComposer.tsx');
    expect(composer).toContain('<AxeComposerVak');
    expect(composer).toContain('voice.startListening()');
    expect(composer).toContain('voice.sendMessage(payload)');
    expect(composer).toContain('toonAgentsBalk={false}');
  });

  it('renders Boss and AXE as dots and delegated agents as triangle avatars', () => {
    const chat = bron('presentation/components/layout/MobileChat.tsx');
    expect(chat).toContain("const label = mine ? 'Boss'");
    expect(chat).toContain("agent?.name ?? 'AXE'");
    expect(chat).toContain('<ManagerAvatar agent={agent}');
  });

  /* 2 okt: acht knoppen op vaste maat waren 345px in een rij van 328 (402) en
     301 (375); de verzendknop stak over de rand. De maat groeit nu mee. */
  it('sizes the phone composer buttons to the screen so send always fits', () => {
    const css = bron('design/axe-look.css');
    for (const vak of ['.axe-mobile-home', '.axe-mobile-tab-composer']) {
      expect(css).toContain(`${vak} .axe-vak {\n    --axe-tel-knop: clamp(28px, calc(12.5vw - 16px), 36px);`);
      expect(css).toMatch(new RegExp(`${vak.replace('.', '\\.')} \\.axe-vak-rij \\.axe-mobile-send \\{\\s*width: calc\\(var\\(--axe-tel-knop\\) \\+ 2px\\) !important;`));
    }
  });

  /* 2 okt: de inklappijl stond op -translate-x-1/2 (Tailwind 3: transform) en
     :active zette transform: scale(). Bij elke druk sprong hij 14px opzij,
     onder je vinger vandaan, en een tik op de linkerhelft viel ernaast. */
  it('keeps the tab composer collapse arrow under the finger while pressed', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    const css = bron('design/axe-look.css');
    const pijl = shell.match(/className="axe-mobile-composer-collapse[^"]*"/)?.[0] ?? '';
    expect(pijl).toContain('inset-x-0 mx-auto');
    expect(pijl).not.toMatch(/translate/);
    expect(css).toMatch(/\.axe-mobile-composer-collapse:active \{\s*scale: \.96;/);
    expect(css).toContain(':root[data-look] .axe-mobile-composer-collapse::before {');
  });

  /* 2 okt, Luka koos optie B uit "Slanke Composer": de pijl maakt de composer
     een dock in plaats van hem weg te halen. Spraak en bestanden blijven één
     tik, en het is dezelfde component, dus tekst en bijlagen blijven staan. */
  it('turns the tab composer into a dock with files, camera, voice and keyboard', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    const composer = bron('presentation/components/layout/MobileComposer.tsx');
    const css = bron('design/axe-look.css');
    expect(shell).toContain('<MobileComposer navigateAfterSend={false} dock={mobieleDock} opDock={setMobieleDock} />');
    expect(shell).toContain('onClick={() => setMobieleDock(true)}');
    // De oude "AXE"-greep is weg, en de stand springt niet terug bij een andere tab.
    expect(shell).not.toContain('axe-mobile-composer-handle');
    expect(shell).not.toMatch(/useEffect\(\(\) => \{ setMobieleDock\(false\)/);
    const dock = composer.slice(composer.indexOf('if (opDock && dock) {'), composer.indexOf('const vak = ('));
    for (const deel of ['<FileUploadButton', '<VisionCaptureButton compact />', '{micKnop}', '{stemKnop}', '<Keyboard']) {
      expect(dock).toContain(deel);
    }
    // Het toetsenbord moet binnen het tikgebaar openen, anders doet iOS niets.
    expect(composer).toMatch(/flushSync\(\(\) => opDock\?\.\(false\)\);\s*vakRef\.current\?\.querySelector\('textarea'\)\?\.focus\(\);/);
    expect(css).toContain(':root[data-look] .axe-mobile-dock {');
  });
});
