import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('Home command center is aangesloten (25 nov v2)', () => {
  it('desktop Home toont het command center, mobiel de rails rond de core', () => {
    const home = bron('../../pages/Home.tsx');
    expect(home).toContain('HomeLiveDashboard');
    expect(home).toMatch(/!isMobile && <HomeLiveDashboard/);
    expect(home).toMatch(/\{isMobile && <AgentVensters \/>\}/);
    expect(home).not.toContain('ArchitectureWorkspace');
    expect(home).toMatch(/--axe-chat-onder/);
    expect(home).toMatch(/axe-home-bolvak/);
    expect(home).toMatch(/data-axe-home-view=\{coreView\}/);
    expect(home).toMatch(/\{isMobile && <div className="axe-home-status/);
  });

  it('één symmetrisch raster: strip / links · core · rechts / vier gelijke kaarten, nooit scrollen', () => {
    const css = bron('homeCommandCenter.css');
    expect(css).toMatch(/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/'strip strip strip strip'/);
    expect(css).toMatch(/'links kern kern rechts'/);
    expect(css).toMatch(/'onder onder onder onder'/);
    expect(css).toMatch(/\.axe-hcc \{[^}]*overflow: hidden/);
    expect(css).toMatch(/\.axe-hcc \{[^}]*pointer-events: none/);
    // Boven de composer en vrij van de ronde dok-knoppen.
    expect(css).toMatch(/--hcc-onder: calc\(var\(--axe-composer-onder[^;]*var\(--axe-composer-hoog[^;]*var\(--hcc-lucht\)\)/);
    expect(css).toMatch(/:root\[data-axe-dash\] \{ --hcc-lucht: 30px; \}/);
    // De core staat in het middenvak, alleen in de AXE-weergave.
    expect(css).toMatch(/\.axe-home-v3\[data-axe-home-view='axe'\] \.axe-home-bolvak \{[^}]*left: calc\(var\(--hcc-inset\) \+ var\(--hcc-kol\) \+ var\(--hcc-gat\)\)/);
    // v4: de feed heeft een vaste hoogte van N ingeklapte regels; geen halve regels, geen schuifbalk.
    expect(css).toMatch(/\.axe-hcc-feed \{[^}]*overflow: hidden;[^}]*height: calc\(var\(--hcc-feed-rijen\) \* var\(--hcc-feed-rij\)/);
    // Providers lopen door naar een verborgen kolom.
    expect(css).toMatch(/\.axe-hcc-providers \{[^}]*flex-wrap: wrap/);
    // Diensten: een dicht raster van drie kolommen; de kerntegels krijgen de rest.
    expect(css).toMatch(/\.axe-hcc-dienstlijst \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.axe-hcc-links > \.axe-hcc-kaart--diensten \{ flex: 0 0 auto; \}/);
    // Het oude losse command-center blok (rails-breedte) is weg.
    expect(bron('homeLive.css')).not.toMatch(/\.axe-home-kpis \{/);
  });

  it('alle kaarten uit het referentiedashboard staan erin', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    // v4: elke kaarttitel is een link naar de detailpagina.
    for (const titel of ['Core overview', 'Services & devices', 'Live feed', 'Needs you', 'Apps health', 'Agents', 'Today', 'AI limits', 'System monitor', 'LLM providers']) {
      expect(dash).toContain(`<Kop tekst="${titel}" onKlik={() => navigate(`);
    }
    // Snelle commando's staan nu in de kopstrook.
    expect(dash).toContain('aria-label="Quick commands"');
    for (const kern of ['AI core', 'Memory', 'Voice', 'Agents', 'LLMs', 'System']) {
      expect(dash).toContain(`<KernTegel label="${kern}"`);
    }
    expect(dash).toContain('Executive briefing');
    expect(dash).toMatch(/setPalette\(true\)/);
    expect(dash).toMatch(/navigate\('\/notifications'\)/);
  });

  it('leest echte polls; eerlijke lege staten, niets verzonnen', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('homeLiveStand');
    expect(dash).toContain('codingSeatsHeartbeat');
    expect(dash).toContain('lockscreenSnapshot');
    expect(dash).toContain('ledgerOverview');
    expect(dash).toContain('calendarJobs');
    expect(dash).toContain('laadDevices');
    expect(dash).toContain('useNotifications');
    expect(dash).toMatch(/useCoreStatusStore\(\(s\) => s\.status\?\.providers/);
    // De probe kent alleen de eerste die antwoordt; de volle lijst komt uit de sleutels.
    expect(dash).toContain('keysOverview');
    expect(dash).toMatch(/providerTegels\(providers, sleutels\.data/);
    expect(dash).toContain('recenteToestellen(');
    expect(dash).toContain('tijdlijnVandaag(');
    // KPI's en limieten komen uit bestaande bronnen, niet uit verzonnen getallen.
    for (const bron of ['usageCreditsSnapshot', 'abonnementVerbruik', 'listTrades', "from('core_tasks').select('status, updated_at')"]) expect(dash).toContain(bron);
    for (const kpi of ['Tasks · 24h', 'Failures · 24h', 'AI sessions today', 'App budgets', 'Tightest AI limit', 'Trading P&L']) expect(dash).toContain(`label="${kpi}"`);
    expect(dash).toContain('No closed trades yet, so no curve');
    expect(dash).toContain('No live metrics: the VPS snapshot did not answer.');
    expect(dash).toContain('No provider check yet.');
    expect(dash).not.toMatch(/Math\.random/);
    expect(dash).not.toContain('useLayoutEffect');
  });

  it('Needs you: Approve/Decline en Ask agent, Luka tikt zelf', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain('GoedkeuringActie');
    expect(dash).toMatch(/rijen=\{stand\.goedkeuringen\}/);
    expect(dash).toMatch(/onVraag=/);
    expect(dash).toMatch(/onBeslis=\{\(rij, akkoord\) => \{ void beslisAgentOk\(\{ akkoord, rij \}\)/);
    // Nergens een automatische beslissing.
    expect(dash).not.toMatch(/beslisAgentOk\(\{ akkoord: true/);
    expect(dash).toContain('Nothing is waiting on you.');
  });

  it('mislukte taken in de feed bieden Fix, niet alleen Retry', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toMatch(/fixDurableTask/);
    expect(dash).toMatch(/actie === 'fix'/);
    expect(dash).toMatch(/taakActieLabel/);
  });
});

describe('Home v4 (25 nov, t70u): KPI-tegels, Apps health, veilige Fix', () => {
  it('Apps health leest echte cron-runs, schema\'s en de VPS-diensten', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toContain("from('core_job_runs').select('app, status, created_at')");
    expect(dash).toContain("from('core_schedules')");
    expect(dash).toContain('appsGezondheid({');
    expect(dash).toMatch(/runs: runs24\.data, schemas: schemas\.data, diensten/);
    expect(dash).toContain('<AppRij key={a.id}');
  });

  it('Fix doet alleen veilige, bestaande acties; wat een OK nodig heeft gaat naar Waiting on you', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    const fix = dash.slice(dash.indexOf('function FixKnop'), dash.indexOf('function Kop('));
    expect(fix).toContain('retryDurableTask(actie.taskId)');
    expect(fix).toContain('nav(actie.route)');
    expect(fix).not.toMatch(/fetch\(|call\(|vpsServiceRestart|cronRunNow|order|deploy|send|pay/i);
    expect(dash).not.toMatch(/vpsServiceRestart|cronRunNow|placeOrder|sendEmail|createDurableTask/);
    expect(dash).toContain("soort: 'wacht', route: '/wacht'");
    // De knop staat er alleen bij let-op of fout.
    expect(dash).toContain('fixAlsNodig(toon, fix ?? null)');
  });

  it('feedregels zijn één zin: ruwe JSON wordt leesbaar', () => {
    const dash = bron('HomeLiveDashboard.tsx');
    expect(dash).toMatch(/titel: eenRegel\(r\.titel\), sub: eenRegel\(r\.sub\)/);
  });
});
