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
