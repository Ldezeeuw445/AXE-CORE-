import { useEffect, Suspense } from 'react';
import { Triangle } from 'lucide-react';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { AxeAtmosphere } from '@/presentation/components/layout/AxeAtmosphere';
import { MobileGlass, LookToggle } from '@/presentation/components/layout/MobileGlass';
import { AxeShellChrome } from '@/presentation/components/layout/AxeShellChrome';
import { PlaatViewSwitch } from '@/presentation/components/layout/PlaatViewSwitch';
import { PlaatSlotHosts } from '@/presentation/components/layout/PlaatSlots';
import { PlaatChat } from '@/presentation/components/layout/PlaatChat';
import { TaskCompletionToasts } from '@/presentation/components/layout/TaskCompletionToasts';
import { RadiaalDok } from '@/presentation/components/layout/RadiaalDok';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { TopNav } from '@/presentation/components/layout/TopNav';
import { Sidebar } from '@/presentation/components/layout/Sidebar';
import { RightPanel } from '@/presentation/components/layout/RightPanel';
import { BottomBar } from '@/presentation/components/layout/BottomBar';
import { isAndroidShellRuntime } from '@/infrastructure/config/apiUrl';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { isIngebed, schilZonderChroom } from '@/presentation/components/layout/zweef/ingebed';
import { BottomNav } from '@/presentation/components/layout/BottomNav';
import { MobileNav } from '@/presentation/components/layout/MobileNav';
import { MobileFab } from '@/presentation/components/layout/MobileFab';
import { GlobalCommandPalette } from '@/presentation/components/layout/GlobalCommandPalette';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import { describeFailure } from '@/domain/globalFailure';
import { magHerstelHerladen, meldGoedeLading } from '@/domain/staleBuildRecovery';
import { useKeyboardInset } from '@/presentation/hooks/useKeyboardInset';
import { SplitWorkspace } from '@/presentation/components/layout/SplitWorkspace';
import { AxeAlgoFloatingChat } from '@/presentation/components/global/AxeAlgoFloatingChat';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';
import { ZweefLaag } from '@/presentation/components/layout/zweef/ZweefLaag';
import { ZwevendeTelefoon } from '@/presentation/components/devices/ZwevendeTelefoon';
import { AxePresenceDock } from '@/presentation/components/layout/AxePresenceDock';
import { QuickNoteDock } from '@/presentation/components/layout/QuickNoteDock';
import { openPageOnMonitor, openPersonalComputerUse } from '@/infrastructure/gateways/windowManagerService';

/** Contained page-crash fallback: keeps the nav/sidebars usable so a single
 *  bad page (e.g. Maps without a Google key) no longer forces a full reload. */
/** Wat er staat terwijl een pagina binnenkomt. Bewust bijna niets: een
 *  spinner die 80 ms zichtbaar is, is onrustiger dan een lege plaat. */
function PageLoading() {
  return <div className="flex-1" aria-busy="true" />;
}

/**
 * @param fout de melding die de ErrorBoundary opving.
 *
 * Die stond hier eerst niet. Het scherm zei "This page crashed" en verder
 * niets, terwijl de melding gewoon beschikbaar was — en AXE Core schrijft geen
 * clientfouten weg en heeft geen devtools in de release-build, dus er was
 * nergens anders om te kijken. Nu staat hij er, met de pagina erbij en een knop
 * om hem te kopiëren: dan is een crash iets om op te lossen in plaats van iets
 * om over te vertellen.
 */
function PageError({ fout }: { fout: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { kind, message } = describeFailure(fout);
  const verouderd = kind === 'verouderd';
  const regel = `${location.pathname} — ${fout}`;

  // Bij een verwisselde build is herladen niet één van de opties maar de
  // enige; opnieuw proberen levert exact dezelfde fout. Eén poging per sessie,
  // want een ongeremde versie knippert eindeloos zonder ooit iets te tonen.
  useEffect(() => {
    if (verouderd && magHerstelHerladen(globalThis.sessionStorage)) window.location.reload();
  }, [verouderd]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-lg">
        <div className="text-3xl mb-3" style={{ color: 'var(--accent-cyan)' }}>◆</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          {verouderd ? 'AXE is bijgewerkt' : 'This page crashed'}
        </h2>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          {verouderd
            ? message
            : 'The rest of AXE keeps working — switch to another tab or go back to Home.'}
        </p>
        <pre
          className="text-[11px] text-left mb-3 max-h-40 overflow-auto rounded-lg px-3 py-2 whitespace-pre-wrap"
          style={{ color: 'rgba(248,113,113,0.9)', border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(255,255,255,0.04)' }}
        >
          {regel}
        </pre>
        <button
          onClick={() => { void navigator.clipboard?.writeText(regel); }}
          className="mb-4 text-[11px] underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          kopieer foutmelding
        </button>
        <div />
        <button
          onClick={() => { if (verouderd) window.location.reload(); else navigate('/'); }}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
        >
          {verouderd ? 'Herlaad AXE' : 'Go to Home'}
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();

  /**
   * De chatplaat hoort bij Home, niet bij elke tab.
   *
   * Gemeten in een venster van 1000px: topbalk 66, PAGINA 288, chatplaat 424,
   * composer 100, onderbalk 76. De chat was dus groter dan de pagina zelf --
   * elke tab kreeg 29 procent van het scherm en propte zijn inhoud daarin,
   * terwijl het eronder leeg oogde. Dat is de "vier dingen in tien procent van
   * de pagina" die hier al vijf keer gemeld is.
   *
   * Home is de plek waar de chat het onderwerp is; daar blijft hij open. Op
   * elke andere tab begint hij dicht en is hij één klik weg. Terrain en Neural
   * deden dit al voor zichzelf -- dit trekt de rest gelijk in plaats van het
   * per pagina opnieuw te regelen.
   *
   * Bewust bij navigatie en niet één keer bij het opstarten: ga je van een tab
   * naar Home en terug, dan hoort het weer te kloppen.
   */
  const setChatDicht = useCoreViewStore(s => s.setChatDicht);
  const setChatUserSet = useCoreViewStore(s => s.setChatUserSet);
  useEffect(() => {
    setChatDicht(location.pathname !== '/');
    // Elke navigatie begint schoon: op de telefoon is de home dan weer clean
    // (chat dicht, sphere + cijfers), tot je 'm daar zelf weer opent. De chat
    // leidt zijn zichtbare stand hiervan af — zie useChatCollapsed.
    setChatUserSet(false);
  }, [location.pathname, setChatDicht, setChatUserSet]);

  // Een pagina die opkomt bewijst dat de brokken kloppen. De herstelpoging mag
  // dan weer op scherp: zonder dit is de eerste update van een sessie de enige
  // die zichzelf oplost, en zit je bij de tweede weer met de hand te herladen.
  useEffect(() => { meldGoedeLading(globalThis.sessionStorage); }, [location.pathname]);
  const opPlaat = useHeeftPlaat();
  // The Android shell draws its own top bar, tab bar and composer natively, so
  // the web chrome would be a second copy of all three stacked on a 384px-wide
  // screen. Treat "inside the shell" exactly like the /mobile surface: hide
  // TopNav, Sidebar, RightPanel, BottomBar and BottomNav, and let the page
  // itself have the whole viewport.
  const isMobile = useIsMobile();
  // Op een telefoon is ELKE route een command-surface: de desktop-chrome
  // (TopNav, Sidebar, RightPanel, PlaatChat, plaat-slots) gaat weg en de pagina
  // krijgt het hele scherm, met de lade als navigatie. Zo is er nergens een
  // desktop-balk of -composer in het klein, en ziet de telefoon eruit zoals de
  // Android-shell (waar isAndroidShellRuntime dit hoe dan ook aanzet). `/mobile`
  // en `/lock` blijven het ook op een breed scherm, voor preview/dev.
  // Samsung's eigen voorwaarde blijft leidend: op een telefoon is ELKE route
  // een command-surface. schilZonderChroom() komt er met OR bij, niet in de
  // plaats van — die helper kent `isMobile` niet, en alleen hem nemen zou een
  // echte telefoon weer desktop-chroom geven. Wat hij wél toevoegt is de
  // ingebedde stand: in het iframe van de zwevende telefoon vreet desktop-
  // chroom 80% van 393px, en daar had deze tak nog geen antwoord op.
  const mobileCommandSurface =
    isMobile || isAndroidShellRuntime()
    || location.pathname === '/mobile' || location.pathname === '/lock'
    || schilZonderChroom(location.pathname, {
      android: isAndroidShellRuntime(),
      ingebed: isIngebed(),
    });
  // De nav is dan altijd de lade; de horizontale onderbalk is alleen desktop.
  const mobileNav = mobileCommandSurface;
  // De telefoon-home is de échte Tauri-glasplaat: een paneel dat op de
  // achtergrond zweeft met een kleine kier eromheen (zie de "AXE Glass Plate"-
  // mockup). Dat is de schil zelf — vaste inset, ronde hoeken, een randje en een
  // subtiele glasvulling, met overflow:hidden zodat de sphere en de composer
  // netjes ín de plaat vallen. De zwevende knoppen (wereldschakelaar, licht/
  // donker, FAB) blijven eroverheen zweven. Alleen op de home, zodat de andere
  // tabs (nog) ongemoeid blijven.
  const opHome = mobileNav && location.pathname === '/';
  // De glasplaat is nu de basis van ELKE mobiele tab (niet meer alleen de home):
  // de Tauri-shell waar alleen het midden per tab wisselt. `/mobile` en `/lock`
  // tekenen hun eigen volledige scherm, dus die houden we buiten de plaat.
  // Zware, volscherm-ervaringen (3D-kaart, browser) passen niet in de plaat met
  // een composer eronder — die vullen het hele scherm zonder plaat/composer, net
  // als /mobile en /lock. De lade-hamburger (portal) blijft om weg te navigeren.
  const volScherm = mobileNav
    && (location.pathname === '/maps-3d' || location.pathname === '/browser');
  const opPlaatMobiel = mobileNav
    && location.pathname !== '/mobile' && location.pathname !== '/lock'
    && !volScherm;
  // On an installed iOS PWA the keyboard overlays the fixed 100dvh layout,
  // hiding the composer + bottom nav. Pad the shell by the measured keyboard
  // height so the bottom chrome rises above it while typing.
  const keyboardInset = useKeyboardInset();

  // Fixed to the dynamic viewport height (not min-h) so the shell never grows
  // past the visible area and pushes the BottomNav below the fold — the reason
  // the nav "fell away" in the installed PWA. Pages scroll inside the flex-1
  // content area, not the shell.
  return (
    <>
      {/* De galaxy en de gloed, achter de plaat. De backdrop-filter van de
          schil vervaagt ze tot glas. */}
      <AxeAtmosphere />
      {/* De geschilderde plaat (wallpaper + licht/donker-sluier) voor elke
          telefoon/web-weergave — op de macOS-desktop doet het native glas dit,
          dus daar rendert MobileGlass niets. Achter de hele schil, op elke tab,
          zodat het niet zwart is zoals de Tauri-app op de Mac ook nooit zwart is. */}
      <MobileGlass />
      {/* De rails aan de rand en de hoogtes die de rest eraan ophangt.
          Doet niets zonder data-look. */}
      <AxeShellChrome />
      {/* Zichtbare terugkoppeling in de app zelf zodra een achtergrondtaak
          klaar is -- zie TaskCompletionToasts.tsx voor waarom dit ernaast
          bestaat en niet in plaats van de al bestaande Mission
          Timeline/Active Tasks. Op elke tab, ook mobiel: dit is precies het
          moment dat je niet wil missen omdat het paneel toevallig dicht was. */}
      <TaskCompletionToasts />
      {/* De wereldschakelaar, midden boven op de plaat. Staat op ELKE tab:
          het is de snelste weg tussen Core, Neural, Terrain en Architecture,
          en hij ligt op de plaat in plaats van in een balk, dus hij zit
          niets in de weg. */}
      {/* De wereldschakelaar hoort óók op de telefoon-home: hij is de 1-op-1
          Tauri-manier tussen Core/Neural/Terrain/Architecture. Alleen de
          desktop-balken (TopNav/Sidebar) blijven op mobiel weg. */}
      {!mobileCommandSurface && opPlaat && !volScherm && <PlaatViewSwitch />}

      {/* Licht/donker-knop rechtsboven op de telefoon. BUITEN de schil, want de
          schil krijgt in de lichte stand een backdrop-filter (frosted glas) en
          dat maakt een vast-gepositioneerd kind t.o.v. de schil i.p.v. het scherm
          — dan verschuift de knop mee met de plaat. Hierbuiten blijft hij vast
          aan de schermhoek. */}
      {mobileNav && (
        <div
          className="fixed z-[70]"
          style={{
            top: opPlaatMobiel ? 'calc(env(safe-area-inset-top, 0px) + 22px)' : 'calc(env(safe-area-inset-top, 0px) + 10px)',
            right: opPlaatMobiel ? 24 : 12,
          }}
        >
          <LookToggle />
        </div>
      )}

    <div
      className={`axe-shell h-[100dvh] flex flex-col bg-black overflow-hidden${opPlaatMobiel ? ' axe-plaat-mobiel' : ''}`}
      style={
        opPlaatMobiel
          ? {
              // De glasplaat: vast paneel met een kier eromheen. Boven onder de
              // statusbalk, onder boven de systeembalk, links/rechts een smalle
              // marge — zo zweeft hij op de achtergrond zoals in de Tauri-app.
              position: 'fixed',
              top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
              left: 12,
              right: 12,
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
              height: 'auto',
              zIndex: 1,
              borderRadius: 28,
              // Diepe slagschaduw (zweeft) + een lichte binnenrand bovenaan, zodat
              // de plaat een glasachtige lichtvang aan de bovenkant krijgt.
              boxShadow: '0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.02)',
              // Content van de plaatrand af: de composer en de sphere raken zo
              // de ronde hoeken niet. Onder bewust krap gehouden: zo staat de hele
              // composer + chips lager en wint de sphere ruimte bovenin.
              paddingLeft: 14,
              paddingRight: 14,
              paddingTop: 10,
              paddingBottom: keyboardInset || 7,
              transition: 'padding-bottom 0.18s ease-out',
            }
          : { background: 'var(--bg-base)', paddingBottom: keyboardInset || undefined, transition: 'padding-bottom 0.18s ease-out' }
      }
    >
      {/* De sloten: lege plekken die de schil vrijhoudt voor wat de huidige tab
          nodig heeft. Een pagina levert er inhoud aan (PlaatPanel / PlaatDock)
          en bepaalt zelf niets over de plaatsing.

          BINNEN de schil, en dat is geen detail. De schil heeft een
          backdrop-filter en dus een eigen stapelcontext. Stonden de sloten
          ernaast, dan werd hun z-index vergeleken met die van de schil als
          geheel -- niet met de rails erin. Een rail op 40 verloor het dan van
          een slot op 30, en de standaardwidgets verdwenen achter de panelen van
          de tab. Binnen dezelfde context doen die getallen weer wat ze zeggen. */}
      {!mobileCommandSurface && opPlaat && <PlaatSlotHosts />}
      {/* Top Navigation */}
      {!mobileCommandSurface && <TopNav />}

      {/* Main layout area — fills remaining space */}
      <div className="flex-1 flex overflow-hidden relative" style={{ background: 'var(--bg-base)' }}>
        {/* Left Sidebar — renders on all devices, handles mobile/desktop internally */}
        {!mobileCommandSurface && <Sidebar />}

        {/* Main Content */}
        <main
          className="flex-1 flex flex-col overflow-hidden relative bg-black"
          style={{ background: 'var(--bg-base)' }}
        >
          {/* Per-route boundary: a crash in one page is contained here (and
              resets on navigation via the key) instead of taking down the
              whole app and forcing a reload. */}
          {/* Suspense hoort hier en niet per route: de pagina's worden lui
              geladen (zie App.tsx), en zonder vangnet valt de hele boom om
              tijdens het ophalen. Eén plek, want elke route komt hier langs. */}
          {/* Elke pagina op de bandbreedte, op ÉÉN plek geregeld.
              Geen enkele pagina gebruikte .axe-bandbreed, dus lijnde op elke
              tab iets anders uit: de een liep tot de rand, de ander stopte
              halverwege, en geen van beide viel samen met de composer eronder.
              Zevenentwintig pagina's stuk voor stuk aanpassen zou zevenentwintig
              kansen op een afwijking zijn -- hier is het er één.
              Een pagina die de volle breedte nodig heeft (een 3D-scene) breekt
              eruit met .axe-vol-breed; dat is de uitzondering en die moet je
              opschrijven, niet per ongeluk krijgen. */}
          <ErrorBoundary key={location.pathname} fallback={(fout) => <PageError fout={fout} />}>
            <Suspense fallback={<PageLoading />}>
              {/* Op de telefoon zweeft de hamburger van de lade linksboven. De
                  mobiele home en het lock screen houden daar zelf rekening mee;
                  de overige pagina's krijgen hier bovenruimte zodat de knop hun
                  kop (titel/Refresh) niet afdekt. */}
              <div
                className="flex-1 min-h-0 flex flex-col"
                style={
                  mobileCommandSurface && location.pathname !== '/mobile' && location.pathname !== '/lock'
                    // Net genoeg om onder de zwevende top-bar (view-switcher) en de
                    // hamburger te blijven; de 52 gaf een grote lege plek bovenin.
                    ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 30px)' }
                    : undefined
                }
              >
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Right Sidebar — renders on all devices, handles mobile/desktop internally */}
        {!mobileCommandSurface && <RightPanel />}
      </div>

      {/* De chat met AXE: de plaat en de composer, op ELKE pagina.
          Dit stond in Home en bestond dus alleen daar; op elke andere tab viel
          je terug op de app-brede onderbalk. Nu hoort het bij de schil, en is
          elke pagina Home met de dingen van die tab erbij. */}
      {/* De volledige composer (met alles erop) hoort óók op de telefoon-home,
          net als in de Tauri-app — niet mijn afgeslankte mobiele composer. */}
      {!mobileCommandSurface && opPlaat && !volScherm && <PlaatChat />}
      {/* The chat between Luka and AXE lives in AxePresenceDock's invisible
          cloud right of the composer (23 sep 2026) -- not in a per-tab card. */}
      {/* Luka, 21 sep 2026: on every page including Home now -- the idle particle
          anchors to the bottom nav's own AXE label (see AxePresenceDock.tsx), which
          Home already has, and Home's own big Core Sphere is a separate element
          entirely, so the two never compete. */}
      {!mobileCommandSurface && opPlaat && <AxePresenceDock />}

      {/* Het radiaal menu linksonder. Naast de chat en niet erin: het zijn
          sprongen naar ergens anders, en die horen niet tussen de knoppen
          waarmee je iets tégen AXE zegt.

          De driehoek klapt de chat open en zet de cursor in het veld -- de
          snelste weg naar "ik wil iets vragen" vanaf welke tab dan ook. Dat
          zit hier en niet in RadiaalDok, zodat hij ergens anders op aan te
          sluiten is zonder dat bestand te wijzigen. */}
      {/* Ook rechts, op ELKE tab.
        *
        * Hij hing alleen op de trading-desk, in TradingRail. Een dok die op één
        * tab bestaat is geen dok maar een knop van die pagina -- en je kwam hem
        * pas tegen als je daar toevallig was. Nu staat hij overal, net als de
        * linker.
        *
        * De tabs en de hoekknop zijn nog de standaard; klopt dat ergens niet
        * (de code-editor bijvoorbeeld), dan krijgt die tab later zijn eigen
        * inhoud mee -- de component neemt ze al als prop. */}
      {!mobileCommandSurface && opPlaat && (
        <RadiaalDok
          kant="rechts"
          hoek={<Triangle size={28} fill="none" strokeWidth={1.7} style={{ color: 'var(--accent-cyan)' }} />}
          hoekLabel="Trading — open in separate window"
          opHoek={() => { void openPageOnMonitor('trading', 0); }}
        />
      )}

      {/* De telefoon blijft een vrije tool. AXE zelf is geen losse grote
          zweefbol meer: de compacte presence hierboven is shell-owned. Home
          behoudt zijn eigen grote Core Sphere in Home.tsx. */}
      {!mobileCommandSurface && opPlaat && (
        <ZweefLaag>
          <ZwevendeTelefoon />
        </ZweefLaag>
      )}

      {!mobileCommandSurface && opPlaat && <QuickNoteDock />}

      {!mobileCommandSurface && opPlaat && (
        <RadiaalDok
          opHoek={() => { void openPersonalComputerUse(); }}
          hoekLabel="Personal Computer Use"
        />
      )}

      {/* De oude onderbalk alleen nog zonder plaat. Met plaat levert PlaatChat
          de composer, en twee invoerbalken onder elkaar is voor niemand te
          raden. */}
      {!mobileCommandSurface && !opPlaat && <BottomBar />}

      {/* Navigatie. Twee vormen, want een telefoon en een desktop willen niet
          hetzelfde:
          - Desktop (geen command-surface): de horizontale BottomNav-strip.
          - Telefoon / Android-shell (command-surface): een lade van links
            (MobileNav) die alleen ruimte pakt als je hem opent. De vaste
            onderbalk nam hoogte in en toonde dezelfde tabs als de app-grid;
            de lade lost dat op en laat home + composer de basis blijven,
            precies zoals de Tauri-app. */}
      {!mobileNav && keyboardInset === 0 && <BottomNav />}
      {mobileNav && <MobileNav />}
      {/* Slimme hoekknop (mobiel): snelacties binnen duim-bereik, de mobiel-eigen
          vervanging van de radiale hoekmenu's van de desktop. Op de glasplaat-
          home weg: de composer heeft z'n eigen knoppen en de FAB botste ertegen —
          de Tauri-home heeft daar ook geen zwevende hoekknop. */}
      {mobileNav && !opPlaatMobiel && !volScherm && <MobileFab />}
      {/* De drie kerncijfers stonden hier los boven de composer; Luka wil ze
          weg — de composer (met kop + tip-chips) is nu de basis onder de sphere,
          zoals de echte AXE CORE-home. MobileStatsRow blijft bestaan voor als we
          de cijfers later ergens anders willen tonen. */}

      {/* Command palette — opened via the TopNav search icon or Cmd/Ctrl+K */}
      <GlobalCommandPalette />
      <SplitWorkspace />

      {/* AXE ALGO's floating chat — survives navigation, same pattern as RightPanel */}
      {!mobileCommandSurface && <AxeAlgoFloatingChat />}
    </div>
    </>
  );
}
