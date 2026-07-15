import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import gsap from 'gsap';
import {
  ArrowLeft, BookmarkPlus, Home
} from 'lucide-react';
import TabBar from './TabBar';
import AddressBar from './AddressBar';
import WebView from './WebView';
import QuickLinksGrid from './QuickLinksGrid';
import Sidebar from './Sidebar';
import SidebarPanels from './SidebarPanels';
import AISidebar from '../ai/AISidebar';
import AISettingsModal from '../ai/AISettingsModal';
import { useBrowserStore } from '@/hooks/useBrowserStore';
import { useAIConfig } from '@/hooks/useAIConfig';

export default function BrowserApp() {
  const navigate = useNavigate();
  const {
    tabs, activeTab, activeTabId, showAIPanel, aiMessages, aiMode, quickLinks, isHome,
    bookmarks, history, downloads, activePanel,
    setShowAIPanel, setAiMode, setActivePanel,
    addTab, closeTab, switchTab, navigateTo, sendAIMessage,
    addBookmark, removeBookmark, addDownload, clearHistory, clearDownloads,
  } = useBrowserStore();

  const { config, isSettingsOpen, setIsSettingsOpen, updateConfig, clearConfig } = useAIConfig();

  const [showHome, setShowHome] = useState(true);
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

  useEffect(() => {
    setShowHome(!activeTab.url);
  }, [activeTab.url]);

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
    setShowHome(true);
  }, []);

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

  return (
    <div className="h-full w-full bg-[#030405] flex flex-col overflow-hidden">
      {/* Top Chrome Bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] bg-[#030405]/95 backdrop-blur-md z-20 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/')}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Exit Browser"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <button onClick={handleBack} disabled={!canGoBack}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button onClick={handleForward} disabled={!canGoForward}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-20 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button onClick={handleHome}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="flex-1" />

        <AddressBar url={activeTab.url} onNavigate={handleNavigate} />

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <button onClick={handleAddBookmark}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Bookmark this page"
          >
            <BookmarkPlus className="w-4 h-4 text-white/60" />
          </button>
          <button onClick={toggleAIPanel}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showAIPanel ? 'bg-cyan-400/20 text-cyan-400' : 'hover:bg-white/10 text-white/60'
            }`}
            title="Toggle AI Panel"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitchTab={handleSwitchTab}
        onCloseTab={handleCloseTab}
        onAddTab={handleNewTab}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          onNavigate={handleNavigate}
          activePanel={activePanel}
          onTogglePanel={togglePanel}
        />

        <SidebarPanels
          activePanel={activePanel}
          onClose={() => setActivePanel('none')}
          bookmarks={bookmarks}
          history={history}
          downloads={downloads}
          onNavigate={handleNavigate}
          onRemoveBookmark={removeBookmark}
          onClearHistory={clearHistory}
          onClearDownloads={clearDownloads}
        />

        <div className="flex-1 relative overflow-hidden">
          {showHome || !activeTab.url ? (
            <div ref={homeRef} className="h-full w-full flex flex-col overflow-y-auto scrollbar-thin">
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-cyan-600/30 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(0,255,255,0.15)]">
                  <svg className="w-10 h-10 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">AXE Browser</h1>
                <p className="text-sm text-white/40 mb-10 text-center">
                  Browse the web with AI assistance. Quick links, bookmarks, and intelligent tools at your fingertips.
                </p>

                <div className="w-full max-w-md mb-10">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = (e.currentTarget.elements.namedItem('search') as HTMLInputElement);
                      if (input.value.trim()) {
                        handleNavigate(`https://www.google.com/search?q=${encodeURIComponent(input.value.trim())}`, 'Google Search');
                        input.value = '';
                      }
                    }}
                    className="relative"
                  >
                    <input
                      name="search"
                      type="text"
                      placeholder="Search the web..."
                      className="w-full h-12 pl-5 pr-12 rounded-2xl bg-white/5 border border-white/[0.08] text-white text-sm
                        placeholder:text-white/30 outline-none focus:border-cyan-400/50 focus:shadow-[0_0_20px_rgba(0,255,255,0.1)]
                        transition-all"
                    />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-cyan-400/20 border border-cyan-400/30
                      flex items-center justify-center hover:bg-cyan-400/30 transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                    </button>
                  </form>
                </div>

                <QuickLinksGrid
                  links={quickLinks}
                  onNavigate={handleNavigate}
                  onAddFavorite={handleAddFavorite}
                />
              </div>
            </div>
          ) : (
            <div ref={mainRef} className="h-full w-full">
              <WebView url={activeTab.url} />
            </div>
          )}
        </div>
      </div>

      {/* AI Sidebar */}
      <AISidebar
        isOpen={showAIPanel}
        onClose={() => setShowAIPanel(false)}
        messages={aiMessages}
        mode={aiMode}
        onModeChange={setAiMode}
        onSendMessage={sendAIMessage}
        currentUrl={activeTab.url}
        aiConfig={config}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigate={handleNavigate}
        onSearch={(q) => handleNavigate(`https://www.google.com/search?q=${encodeURIComponent(q)}`, 'Google Search')}
        onGoBack={handleBack}
        onGoForward={handleForward}
        onRefresh={handleRefresh}
        onBookmark={addBookmark}
        onOpenBookmark={(name) => {
          const bm = bookmarks.find(b => b.title.toLowerCase().includes(name.toLowerCase()));
          if (bm) handleNavigate(bm.url, bm.title);
        }}
        onNewTab={addTab}
        onCloseTab={(idx) => closeTab(tabs[parseInt(idx)]?.id || activeTabId)}
        onSwitchTab={(idx) => switchTab(tabs[parseInt(idx)]?.id || activeTabId)}
        tabs={tabs.map(t => ({ title: t.title, url: t.url }))}
        bookmarks={bookmarks.map(b => ({ title: b.title, url: b.url, folder: b.folder }))}
        history={history.map(h => ({ title: h.title, url: h.url }))}
      />

      {/* AI Settings Modal */}
      <AISettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onUpdate={updateConfig}
        onClear={clearConfig}
      />
    </div>
  );
}
