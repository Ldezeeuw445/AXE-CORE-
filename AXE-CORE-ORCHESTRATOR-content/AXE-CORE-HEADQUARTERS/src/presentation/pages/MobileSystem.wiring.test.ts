import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
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
    expect(shell).not.toContain("location.pathname !== '/mobile' && location.pathname !== '/lock'");
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
    expect(shell).toContain("max(env(safe-area-inset-bottom, 0px), 6px)");
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

  it('extends the mobile glass plate close to the iPhone safe-area hardware', () => {
    const shell = bron('presentation/components/layout/AppShell.tsx');
    expect(shell).toContain("calc(env(safe-area-inset-top, 0px) + 2px)");
    expect(shell).toContain("bottom: location.pathname === '/mobile'");
    expect(shell).toContain("? 0");
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

  it('keeps only Neural Terrain Architecture in the phone world switch', () => {
    const mobile = bron('presentation/pages/MobileSystem.tsx');
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
});
