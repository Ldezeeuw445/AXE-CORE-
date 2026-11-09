import { describe, expect, it } from 'vitest';
import { EIGEN_APPS, eigenApp } from './eigenApps';
import {
  AXON_SUPABASE_REF,
  KERN_SUPABASE_REF,
  WKWEBVIEW_SAFARI_UA,
  dataStoreIdentifierVoor,
  sessieBronVan,
  shellBasisUrl,
  shellUrl,
  shellWebviewOpties,
  supabaseRefVan,
  urlZonderGeheim,
  type ShellSessie,
} from './eigenAppSessie';

const NU = Date.parse('2026-11-09T18:00:00Z');

const kern: ShellSessie = {
  bron: 'kern',
  tokens: { access_token: 'kern-a', refresh_token: 'kern-r', expires_at: NU / 1000 + 3600 },
};
const axon: ShellSessie = {
  bron: 'axon',
  tokens: { access_token: 'axon-a', refresh_token: 'axon-r', expires_at: NU / 1000 + 3600 },
};

describe('radial app / URL / project matrix', () => {
  it('kent elke radial-app, de sessiebron en het Supabase-project — zonder sleutels', () => {
    const matrix = EIGEN_APPS.map(app => ({
      id: app.id,
      naam: app.naam,
      url: app.url ?? null,
      pagina: app.pagina ?? null,
      bron: sessieBronVan(app),
      project: sessieBronVan(app) ? supabaseRefVan(sessieBronVan(app)!) : null,
    }));
    expect(matrix).toEqual([
      { id: 'trading-os', naam: 'Trading OS', url: 'https://tradingosapp.com', pagina: null, bron: 'kern', project: KERN_SUPABASE_REF },
      { id: 'companion', naam: 'AXE Companion', url: 'https://axecompanion.com/chat', pagina: null, bron: 'kern', project: KERN_SUPABASE_REF },
      { id: 'axon', naam: 'AXON Memory', url: 'https://app.axon-memory.com', pagina: null, bron: 'axon', project: AXON_SUPABASE_REF },
      { id: 'developer', naam: 'AXE Developer', url: null, pagina: 'code-editor', bron: null, project: null },
      { id: 'northsea', naam: 'NorthSea Desk', url: null, pagina: 'northsea', bron: null, project: null },
    ]);
    expect(KERN_SUPABASE_REF).not.toBe(AXON_SUPABASE_REF);
  });
});

describe('shellBasisUrl', () => {
  it('zet Companion op apex /login, niet de www-homepagina', () => {
    const app = eigenApp('companion')!;
    expect(shellBasisUrl(app, 'https://www.axecompanion.com')).toBe('https://axecompanion.com/login');
    expect(shellBasisUrl(app, 'https://axecompanion.com/chat')).toBe('https://axecompanion.com/login');
  });

  it('zet Trading OS op /login van dezelfde origin als registered_apps', () => {
    const app = eigenApp('trading-os')!;
    expect(shellBasisUrl(app, 'https://tradingosapp.com')).toBe('https://tradingosapp.com/login');
    expect(shellBasisUrl(app, 'https://tradingosapp.com/app')).toBe('https://tradingosapp.com/login');
  });
});

describe('shellUrl projectisolatie', () => {
  it('plakt de Core-sessie alleen op Companion en Trading OS', () => {
    const companion = shellUrl(eigenApp('companion')!, 'https://www.axecompanion.com', kern, NU);
    expect(companion.startsWith('https://axecompanion.com/login#')).toBe(true);
    expect(companion).toContain('access_token=kern-a');
    expect(companion).toContain('refresh_token=kern-r');
    expect(companion).not.toContain('type=recovery');
    expect(companion).not.toContain('axon-a');

    const trading = shellUrl(eigenApp('trading-os')!, 'https://tradingosapp.com', kern, NU);
    expect(trading.startsWith('https://tradingosapp.com/login#')).toBe(true);
    expect(trading).toContain('access_token=kern-a');
  });

  it('plakt de AXON-sessie alleen op AXON, met type=recovery zoals de iframe', () => {
    const url = shellUrl(eigenApp('axon')!, 'https://app.axon-memory.com', axon, NU);
    expect(url.startsWith('https://app.axon-memory.com/#')).toBe(true);
    expect(url).toContain('access_token=axon-a');
    expect(url).toContain('type=recovery');
    expect(url).not.toContain('kern-a');
  });

  it('weiger een token van het andere project', () => {
    expect(shellUrl(eigenApp('companion')!, 'https://axecompanion.com/chat', axon, NU)).toBe('https://axecompanion.com/login');
    expect(shellUrl(eigenApp('axon')!, 'https://app.axon-memory.com', kern, NU)).toBe('https://app.axon-memory.com/');
  });

  it('laat lokale AXE-pagina\'s met rust — die delen Core\'s webview-store', () => {
    expect(shellUrl(eigenApp('developer')!, 'https://example.invalid', kern, NU)).toBe('https://example.invalid');
    expect(shellUrl(eigenApp('northsea')!, 'https://example.invalid', axon, NU)).toBe('https://example.invalid');
  });

  it('zonder sessie geen hash, dus niets om te lekken', () => {
    expect(shellUrl(eigenApp('companion')!, 'https://axecompanion.com/chat', null, NU)).toBe('https://axecompanion.com/login');
    expect(urlZonderGeheim('https://axecompanion.com/login#access_token=geheim')).toBe('https://axecompanion.com/login');
  });
});

describe('WKWebView-opties', () => {
  it('Safari-UA en geen incognito op remote apps, en een vaste store per app', () => {
    const c = shellWebviewOpties(eigenApp('companion')!);
    const a = shellWebviewOpties(eigenApp('axon')!);
    expect(c).toMatchObject({ userAgent: WKWEBVIEW_SAFARI_UA, incognito: false });
    expect(c.dataStoreIdentifier).toHaveLength(16);
    expect(a.dataStoreIdentifier).toHaveLength(16);
    expect(c.dataStoreIdentifier).not.toEqual(a.dataStoreIdentifier);
    expect(dataStoreIdentifierVoor('companion')).toEqual(c.dataStoreIdentifier);
    expect(WKWEBVIEW_SAFARI_UA).toContain('Safari/');
    expect(WKWEBVIEW_SAFARI_UA).not.toMatch(/Tauri/i);
  });

  it('zet geen eigen store op Developer/NorthSea — anders is de Core-sessie daar weg', () => {
    expect(shellWebviewOpties(eigenApp('developer')!)).toEqual({});
    expect(shellWebviewOpties(eigenApp('northsea')!)).toEqual({});
  });
});
