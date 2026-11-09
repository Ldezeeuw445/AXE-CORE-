import { describe, expect, it } from 'vitest';
import { EIGEN_APPS, eigenApp } from './eigenApps';
import {
  AXON_SUPABASE_REF,
  KERN_SUPABASE_REF,
  SHELL_VERTROUWEN,
  WKWEBVIEW_SAFARI_UA,
  dataStoreIdentifierVoor,
  sessieBronVan,
  shellFoutTekst,
  shellUrl,
  shellWebviewOpties,
  supabaseRefVan,
  urlZonderGeheim,
} from './eigenAppSessie';

const GEHEIM = /access_token|refresh_token|id_token|type=recovery|(?:^|[?#&])code=/i;

const VIJANDIGE_LIVE: readonly string[] = [
  'https://evil.example/login',
  'http://tradingosapp.com/login',
  'https://www.axecompanion.com/',
  'https://www.axecompanion.com/login',
  'https://www.axecompanion.com/chat',
  'https://axon-memory.com/',
  'https://axecompanion.com.evil.example/',
  'https://tradingosapp.com.attacker/login',
  'javascript:alert(1)',
  'https://app.axon-memory.com/#access_token=gestolen&refresh_token=r&type=recovery',
  'https://axecompanion.com/chat#access_token=kern-a',
];

describe('radial app / URL / project matrix', () => {
  it('kent elke radial-app, het vertrouwde origin en het Supabase-project — zonder sleutels', () => {
    const matrix = EIGEN_APPS.map(app => ({
      id: app.id,
      naam: app.naam,
      url: app.url ?? null,
      pagina: app.pagina ?? null,
      bron: sessieBronVan(app),
      project: sessieBronVan(app) ? supabaseRefVan(sessieBronVan(app)!) : null,
      shell: shellUrl(app, 'https://evil.example'),
    }));
    expect(matrix).toEqual([
      {
        id: 'trading-os', naam: 'Trading OS', url: 'https://tradingosapp.com', pagina: null,
        bron: 'kern', project: KERN_SUPABASE_REF, shell: SHELL_VERTROUWEN['trading-os'].url,
      },
      {
        id: 'companion', naam: 'AXE Companion', url: 'https://axecompanion.com/chat', pagina: null,
        bron: 'kern', project: KERN_SUPABASE_REF, shell: SHELL_VERTROUWEN.companion.url,
      },
      {
        id: 'axon', naam: 'AXON Memory', url: 'https://app.axon-memory.com', pagina: null,
        bron: 'axon', project: AXON_SUPABASE_REF, shell: SHELL_VERTROUWEN.axon.url,
      },
      {
        id: 'developer', naam: 'AXE Developer', url: null, pagina: 'code-editor',
        bron: null, project: null, shell: null,
      },
      {
        id: 'northsea', naam: 'NorthSea Desk', url: null, pagina: 'northsea',
        bron: null, project: null, shell: null,
      },
    ]);
    expect(KERN_SUPABASE_REF).not.toBe(AXON_SUPABASE_REF);
    expect(SHELL_VERTROUWEN.companion.project).toBe(KERN_SUPABASE_REF);
    expect(SHELL_VERTROUWEN['trading-os'].project).toBe(KERN_SUPABASE_REF);
    expect(SHELL_VERTROUWEN.axon.project).toBe(AXON_SUPABASE_REF);
  });
});

describe('shellUrl fail-closed origin', () => {
  it('opent alleen de vastgelegde HTTPS-origins, nooit registered_apps/liveUrl', () => {
    expect(shellUrl(eigenApp('companion')!, 'https://www.axecompanion.com')).toBe('https://axecompanion.com/chat');
    expect(shellUrl(eigenApp('companion')!, 'https://axecompanion.com/login')).toBe('https://axecompanion.com/chat');
    expect(shellUrl(eigenApp('trading-os')!, 'https://tradingosapp.com/app')).toBe('https://tradingosapp.com/');
    expect(shellUrl(eigenApp('axon')!, 'https://app.axon-memory.com/home')).toBe('https://app.axon-memory.com/');
  });

  it('weiger vijandige liveUrl: geen navigatie naar marketing, http of een andere host', () => {
    for (const live of VIJANDIGE_LIVE) {
      expect(shellUrl(eigenApp('companion')!, live)).toBe('https://axecompanion.com/chat');
      expect(shellUrl(eigenApp('trading-os')!, live)).toBe('https://tradingosapp.com/');
      expect(shellUrl(eigenApp('axon')!, live)).toBe('https://app.axon-memory.com/');
    }
  });

  it('zet nooit tokens of type=recovery in de navigatie-URL, ook niet bij een geldige sessie-lookalike in liveUrl', () => {
    for (const app of EIGEN_APPS) {
      const url = shellUrl(app, 'https://evil.example/#access_token=kern-a&refresh_token=kern-r&type=recovery');
      if (url) {
        expect(url.startsWith('https://')).toBe(true);
        expect(url).not.toMatch(GEHEIM);
        expect(url.includes('#')).toBe(false);
      } else {
        expect(app.pagina).toBeTruthy();
      }
    }
  });

  it('opent lokale AXE-pagina\'s niet als remote URL', () => {
    expect(shellUrl(eigenApp('developer')!, 'https://example.invalid')).toBeNull();
    expect(shellUrl(eigenApp('northsea')!, 'https://evil.example')).toBeNull();
  });
});

describe('urlZonderGeheim / shellFoutTekst', () => {
  it('haalt hash, query-tokens en recovery-flags uit logs', () => {
    expect(urlZonderGeheim('https://axecompanion.com/login#access_token=geheim&refresh_token=r')).toBe(
      'https://axecompanion.com/login',
    );
    expect(urlZonderGeheim('https://app.axon-memory.com/#access_token=a&type=recovery')).toBe(
      'https://app.axon-memory.com/',
    );
    const query = urlZonderGeheim('https://axecompanion.com/auth/callback?code=pkce-code&next=/chat');
    expect(query).not.toMatch(GEHEIM);
    expect(query).not.toContain('pkce-code');
    expect(query.startsWith('https://axecompanion.com/auth/callback')).toBe(true);

    const fout = shellFoutTekst(
      'trading-os',
      'https://evil.example/login#access_token=kern-a&refresh_token=kern-r',
    );
    expect(fout.startsWith('shell trading-os: ')).toBe(true);
    expect(fout).not.toMatch(GEHEIM);
    expect(fout).not.toContain('kern-a');
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
