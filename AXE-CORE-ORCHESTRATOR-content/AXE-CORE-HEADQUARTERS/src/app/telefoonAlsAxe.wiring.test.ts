/**
 * De telefoon-aansluitingen zitten er echt in.
 *
 * Drie dingen die alleen bestaan als ze ergens aangesloten staan, en die alle
 * drie stil wegvallen als die ene regel verdwijnt:
 *
 * - een snelkoppeling naar een route die niet meer bestaat opent een leeg scherm;
 * - een share-target waarvan niemand de zoekreeks leest, opent de app en gooit
 *   je deling weg;
 * - een badge die niemand wist, blijft op je icoon staan tot je het toestel
 *   herstart.
 *
 * Geen van die drie maakt een test rood of een build stuk. Vandaar deze.
 *
 * Leest de bron en niet `dist/`: die staat niet in git, dus een test die daarop
 * leunt is groen om de verkeerde reden op een verse checkout.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../..');
const lees = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const manifest = JSON.parse(lees('public/manifest.json')) as {
  shortcuts?: { name: string; url: string }[];
  share_target?: { action: string; method: string; params: Record<string, string> };
};

describe('snelkoppelingen op het app-icoon', () => {
  it('staan in het manifest', () => {
    expect(manifest.shortcuts?.length).toBeGreaterThan(0);
  });

  it('wijzen naar routes die echt bestaan', () => {
    const app = lees('src/app/App.tsx');
    // Zonder deze regel is de lus hieronder leeg-groen zodra de
    // snelkoppelingen verdwijnen -- een test die niets meer bewaakt.
    expect(manifest.shortcuts?.length ?? 0).toBeGreaterThan(0);
    for (const s of manifest.shortcuts ?? []) {
      // HashRouter: zonder # komt de telefoon op een pad uit dat de server moet
      // kennen, en dat kent hij niet.
      expect(s.url.startsWith('/#/'), `${s.name} mist de #`).toBe(true);
      const route = s.url.replace('/#/', '');
      expect(app.includes(`path="${route}"`), `route ${route} bestaat niet in App.tsx`).toBe(true);
    }
  });
});

describe('delen vanuit een andere app', () => {
  it('AXE meldt zich aan als share target', () => {
    expect(manifest.share_target?.method).toBe('GET');
    expect(Object.keys(manifest.share_target?.params ?? {}).sort())
      .toEqual(['text', 'title', 'url']);
  });

  it("de actie is '/', want dat pad bestaat gegarandeerd", () => {
    // Een verzonnen pad als /deel werkt alleen als de hosting onbekende paden
    // naar index.html stuurt. Dat is een aanname over Cloudflare, geen feit.
    expect(manifest.share_target?.action).toBe('/');
  });

  it('en iemand leest die zoekreeks ook echt uit', () => {
    expect(lees('src/app/main.tsx')).toContain('installDeelDoel()');
    expect(lees('src/presentation/components/layout/MobileComposer.tsx'))
      .toContain('neemDeelTekst');
  });
});

describe('de badge op het app-icoon', () => {
  it('wordt bij een push gezet, ook als de app dicht is', () => {
    expect(lees('public/axe-push-sw.js')).toContain('setAppBadge');
  });

  it('volgt daarna het echte aantal ongelezen meldingen', () => {
    const ctx = lees('src/presentation/contexts/NotificationContext.tsx');
    expect(ctx).toContain('pasBadgeToe');
    expect(ctx).toContain('[unreadCount]');
  });
});
