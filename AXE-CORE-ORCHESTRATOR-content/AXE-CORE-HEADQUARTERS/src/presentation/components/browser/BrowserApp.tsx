import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import gsap from 'gsap';
import {
  ArrowLeft, BookmarkPlus, Home, Zap, MousePointerClick, Menu, Palette
} from 'lucide-react';
import { BrowserAgentPanel } from '@/presentation/components/browser/BrowserAgentPanel';
import TabBar from '@/presentation/components/browser/TabBar';
import AddressBar from '@/presentation/components/browser/AddressBar';
import WebView from '@/presentation/components/browser/WebView';
import { BrowserStartPage } from '@/presentation/components/browser/BrowserStartPage';
import { AxeFloatingPresence } from '@/presentation/components/browser/AxeFloatingPresence';
import { BrowserSurfaceBackground } from '@/presentation/components/browser/BrowserSurfaceBackground';
import { useBrowserSurfaceTheme } from '@/presentation/hooks/useBrowserSurfaceTheme';
import { BrowserUnifiedSidebar } from '@/presentation/components/browser/BrowserUnifiedSidebar';
import AISettingsModal from '@/presentation/components/ai/AISettingsModal';
import { MobileBrowserChat } from '@/presentation/components/browser/MobileBrowserChat';
import { useBrowserStore } from '@/presentation/hooks/useBrowserStore';
import { useAIConfig } from '@/presentation/hooks/useAIConfig';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { sendBrowserAIMessage } from '@/application/browser/browserAIService';
import type { BrowserAIProviderId } from '@/domain/browser/browserAIProviders';
import { StandaloneBrowserShell, OpenStandaloneBrowserButton } from '@/presentation/components/browser/StandaloneBrowserShell';

interface BrowserAppProps {
  /** When true, renders in Arc-style glass shell for standalone desktop window. */
  standalone?: boolean;
}

export default function BrowserApp({ standalone = false }: BrowserAppProps) {
  const navigate = useNavigate();
  const {
    tabs, activeTab, activeTabId, showAIPanel, aiMessages, quickLinks, isHome,
    bookmarks, history, downloads, activePanel,
    setShowAIPanel, setActivePanel,
    addTab, closeTab, switchTab, navigateTo, sendAIMessage, appendAIMessage,
    addBookmark, removeBookmark, addDownload, clearHistory, clearDownloads,
  } = useBrowserStore();

  const { config, isSettingsOpen, setIsSettingsOpen, updateConfig, clearConfig } = useAIConfig();

  const isMobile = useIsMobile();
  const { theme: surfaceTheme, toggleTheme, isGlass } = useBrowserSurfaceTheme();
  // Measured, not assumed: the dock clamps its drag against the real content
  // height, which differs between the browser, the installed PWA and the
  // Android shell (each has its own chrome above and below).
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !isMobile) return;
    const ro = new ResizeObserver(([entry]) => setContentHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  /** Mobile only — the rail and its panel slide in together. */
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [showBrowserAgent, setShowBrowserAgent] = useState(false);
  const [agentSeed, setAgentSeed] = useState<string | undefined>(undefined);
  const [loadingProvider, setLoadingProvider] = useState<BrowserAIProviderId | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const homeRef = useRef(null);
  const mainRef = useRef(null);

  useEffect(() => {
    if (homeRef.current) {
      gsap.from(homeRef.current, { opacity: 0, duration: 0.5, ease: 'power2.out' });
    }
  }, []);

  useEffect(() => {
    if (mainRef.current) {
      gsap.from(mainRef.current, { opacity: 0, x: 20, duration: 0.4, ease: 'power2.out' });
    }
  }, [activeTabId]);

  const isOnHome = !activeTab.url;

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [activeTab.url]);

  useEffect(() => {
    setCanGoBack(history.length > 0);
  }, [history]);

  useEffect(() => {
    setCanGoForward(false);
  }, []);

  // WebView blocked-sites CTA → open Playwright Browser Agent panel
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string; instruction?: string }>).detail;
      if (detail?.instruction) setAgentSeed(detail.instruction);
      else if (detail?.url) setAgentSeed(`Open ${detail.url} and show me the page.`);
      setShowBrowserAgent(true);
    };
    window.addEventListener('axe-open-browser-agent', onOpen);
    return () => window.removeEventListener('axe-open-browser-agent', onOpen);
  }, []);

  const handleNavigate = useCallback(
    (url: string, title?: string) => {
      navigateTo(url, title);
    },
    [navigateTo]
  );

  const handleBack = useCallback(() => {
    if (history.length > 1) {
      const prev = history[1];
      navigateTo(prev.url, prev.title);
    }
  }, [history, navigateTo]);

  const handleForward = useCallback(() => {}, []);

  const handleRefresh = useCallback(() => {
    if (activeTab.url) {
      navigateTo(activeTab.url, activeTab.title);
    }
  }, [activeTab, navigateTo]);

  const handleHome = useCallback(() => {
    navigateTo('', 'New Tab');
  }, [navigateTo]);

  const handleAIProviderSubmit = useCallback(async (provider: BrowserAIProviderId, message: string, mode?: string) => {
    setLoadingProvider(provider);
    appendAIMessage('user', `[${provider}] ${message}`);

    try {
      const result = await sendBrowserAIMessage(provider, message, {
        mode,
        apiKey: config.apiKey || undefined,
      });

      appendAIMessage('assistant', result.message);

      if (result.status === 'agent_started' || result.status === 'running' || provider === 'browser-use' || provider === 'camofox') {
        setAgentSeed(message);
        setShowBrowserAgent(true);
      }
    } catch (err) {
      appendAIMessage('assistant', `Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingProvider(null);
    }
  }, [appendAIMessage, config.apiKey]);

  const handleAddBookmark = useCallback(() => {
    if (activeTab.url) {
      addBookmark(activeTab.title || activeTab.url, activeTab.url, 'Default');
    }
  }, [activeTab, addBookmark]);

  const toggleAIPanel = useCallback(() => {
    setShowAIPanel(!showAIPanel);
  }, [showAIPanel, setShowAIPanel]);

  const togglePanel = useCallback(
    (panel: 'bookmarks' | 'history' | 'downloads' | 'none') => {
      setActivePanel(activePanel === panel ? 'none' : panel);
    },
    [activePanel, setActivePanel]
  );

  const handleNewTab = useCallback(() => {
    addTab();
  }, [addTab]);

  const handleCloseTab = useCallback(
    (id: string) => {
      closeTab(id);
    },
    [closeTab]
  );

  const handleSwitchTab = useCallback(
    (id: string) => {
      switchTab(id);
    },
    [switchTab]
  );

  const handleAddFavorite = useCallback(() => {
    if (activeTab.url) {
      addBookmark(activeTab.title || activeTab.url, activeTab.url, 'Favorites');
    }
  }, [activeTab, addBookmark]);

  /**
   * The sidebar's bookmark tool is (title?, folder?) -- it has no URL to give,
   * because it means "bookmark the page I am looking at".
   *
   * addBookmark is (title, url, folder). Passing it straight through, which is
   * what this did, silently shifted the arguments by one: the FOLDER landed in
   * the url slot. Ask AXE to bookmark a page into "Favorites" and you got a
   * bookmark whose address was the word Favorites.
   */
  const handleAIBookmark = useCallback(
    (title?: string, folder?: string) => {
      if (!activeTab.url) return;
      addBookmark(title || activeTab.title || activeTab.url, activeTab.url, folder || 'Default');
    },
    [activeTab, addBookmark],
  );

  const browserChrome = (
    <div className={`h-full w-full flex flex-col overflow-hidden relative ${standalone ? '' : 'bg-transparent'}`}>
      {!standalone && <BrowserSurfaceBackground theme={surfaceTheme} />}
      {/* Top Chrome Bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-axe-line bg-black/40 backdrop-blur-panel z-20 flex-shrink-0">
        <div className="flex items-center gap-1">
          {isMobile && (
            <button onClick={() => setDrawerOpen(o => !o)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Menu"
              aria-label="Menu"
            >
              <Menu className="w-4 h-4 text-white/60" />
            </button>
          )}
          {!standalone && (
          <button onClick={() => navigate('/')}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Exit Browser"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          )}
          <button onClick={handleBack} disabled={!canGoBack}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          {/* Forward is the least-pressed control in a browser and the address
              bar is the most-needed. On a phone the width goes to the latter. */}
          {!isMobile && (
            <button onClick={handleForward} disabled={!canGoForward}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
          <button onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          {!isMobile && (
            <button onClick={handleHome}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4 text-white/60" />
            </button>
          )}
        </div>

        {/* Centring spacers on desktop; on a phone they squeeze the address
            bar into a stub, so there it simply takes the room that is left. */}
        {!isMobile && <div className="flex-1" />}

        <div className={isMobile ? 'flex-1 min-w-0' : ''}>
          <AddressBar url={activeTab.url} onNavigate={handleNavigate} />
        </div>

        {!isMobile && <div className="flex-1" />}

        <div className="flex items-center gap-1">
          {!isMobile && (
            <button onClick={handleAddBookmark}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Bookmark this page"
            >
              <BookmarkPlus className="w-4 h-4 text-white/60" />
            </button>
          )}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isGlass ? 'bg-axe-tint text-axe-accent-ice' : 'hover:bg-white/10 text-white/60'
            }`}
            title={isGlass ? 'Switch to AXE black surface' : 'Switch to glassmorphism background'}
          >
            <Palette className="w-4 h-4" />
          </button>
          <button onClick={toggleAIPanel}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showAIPanel ? 'bg-cyan-400/20 text-cyan-400' : 'hover:bg-white/10 text-white/60'
            }`}
            title="Toggle AI Panel"
          >
            <Zap className="w-4 h-4" />
          </button>
          <button onClick={() => { setAgentSeed(undefined); setShowBrowserAgent(true); }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 transition-colors cursor-pointer"
            title="Browser Agent — AXE navigeert/klikt/typt écht"
          >
            <MousePointerClick className="w-4 h-4" />
          </button>
          {!standalone && <OpenStandaloneBrowserButton />}
        </div>
      </div>

      {/* Tab Bar — a second chrome row costs 8% of a 384px-tall-ish phone
          viewport for something rarely used there. */}
      {!isMobile && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitchTab={handleSwitchTab}
          onCloseTab={handleCloseTab}
          onAddTab={handleNewTab}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop: the rail is always there, and its panel opens beside it.
            Phone: the same two slide in together as a drawer. The rail is 60
            of 384 CSS px and its panel another 280 — parked on screen that is
            most of the width spent on bookmarks you open once a day. */}
        {!isMobile && !standalone ? (
          <BrowserUnifiedSidebar
            onNavigate={handleNavigate}
            currentUrl={activeTab.url}
            activePanel={activePanel}
            onTogglePanel={togglePanel}
            bookmarks={bookmarks}
            history={history}
            downloads={downloads}
            onRemoveBookmark={removeBookmark}
            onClearHistory={clearHistory}
            onClearDownloads={clearDownloads}
          />
        ) : isMobile ? (
          <>
            {/* Backdrop first, so a tap anywhere on the page closes the
                drawer — the gesture people already expect. */}
            {drawerOpen && (
              <div
                className="absolute inset-0 z-30 bg-black/60"
                onClick={() => { setDrawerOpen(false); setActivePanel('none'); }}
              />
            )}
            <div
              className="absolute left-0 top-0 h-full z-40 flex transition-transform duration-200 ease-out"
              style={{ transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)' }}
            >
              <BrowserUnifiedSidebar
                onNavigate={(url, title) => { handleNavigate(url, title); setDrawerOpen(false); }}
                currentUrl={activeTab.url}
                activePanel={activePanel}
                onTogglePanel={togglePanel}
                bookmarks={bookmarks}
                history={history}
                downloads={downloads}
                onRemoveBookmark={removeBookmark}
                onClearHistory={clearHistory}
                onClearDownloads={clearDownloads}
              />
            </div>
          </>
        ) : null}

        {/* On a phone the page and the chat split the height; the dock below
            is the composer. On desktop this is just the page, and the chat
            stays in AISidebar where there is width to spare. */}
        <div ref={contentRef} className="flex-1 relative overflow-hidden flex flex-col">
          <div className="flex-1 relative overflow-hidden">
          {isOnHome ? (
            <div ref={homeRef} className="h-full w-full">
              <BrowserStartPage
                quickLinks={quickLinks}
                onNavigate={handleNavigate}
                onAddFavorite={handleAddFavorite}
                onAIProviderSubmit={handleAIProviderSubmit}
                loadingProvider={loadingProvider}
              />
            </div>
          ) : (
            <div ref={mainRef} className="h-full w-full">
              <WebView url={activeTab.url} mobile={isMobile} />
            </div>
          )}
          </div>

          {!isMobile && (
            <AxeFloatingPresence
              visible={showAIPanel}
              messages={aiMessages}
              onSendMessage={sendAIMessage}
              aiConfig={config}
              onOpenSettings={() => setIsSettingsOpen(true)}
              isLoading={loadingProvider !== null}
            />
          )}

          {isMobile && (
            <MobileBrowserChat
              messages={aiMessages}
              onSend={sendAIMessage}
              containerHeight={contentHeight}
            />
          )}
        </div>
      </div>

      {/* AI Settings Modal */}
      <AISettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onUpdate={updateConfig}
        onClear={clearConfig}
      />

      {/* Browser Agent — real Playwright session */}
      {showBrowserAgent && (
        <BrowserAgentPanel
          onClose={() => { setShowBrowserAgent(false); setAgentSeed(undefined); }}
          initialInstruction={agentSeed}
        />
      )}
    </div>
  );

  if (standalone) {
    return (
      <StandaloneBrowserShell
        onOpenInApp={() => navigate('/browser')}
        surfaceTheme={surfaceTheme}
        currentUrl={activeTab.url}
        onNavigate={handleNavigate}
      >
        {browserChrome}
      </StandaloneBrowserShell>
    );
  }

  return browserChrome;
}
