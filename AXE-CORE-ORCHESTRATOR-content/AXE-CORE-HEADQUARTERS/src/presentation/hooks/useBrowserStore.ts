import { useState, useCallback, useEffect } from 'react';
import type { Tab, AIMessage, QuickLink, Bookmark, HistoryEntry, DownloadItem, AIMode, SidebarPanel } from '@/domain/types/browser';

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { id: '1', title: 'Google', url: 'https://www.google.com', icon: 'search', color: '#4285F4' },
  { id: '2', title: 'GitHub', url: 'https://github.com', icon: 'code', color: '#333' },
  { id: '3', title: 'Vercel', url: 'https://vercel.com', icon: 'triangle', color: '#fff' },
  { id: '4', title: 'Supabase', url: 'https://supabase.com', icon: 'database', color: '#3ECF8E' },
  { id: '5', title: 'Cloudflare', url: 'https://dash.cloudflare.com', icon: 'shield', color: '#F48120' },
  { id: '6', title: 'Railway', url: 'https://railway.app', icon: 'train', color: '#fff' },
  { id: '7', title: 'Resend', url: 'https://resend.com', icon: 'mail', color: '#fff' },
  { id: '8', title: 'ChatGPT', url: 'https://chatgpt.com', icon: 'message-square', color: '#10A37F' },
  { id: '9', title: 'Perplexity', url: 'https://perplexity.ai', icon: 'compass', color: '#1FB8A5' },
  { id: '10', title: 'Claude', url: 'https://claude.ai', icon: 'flame', color: '#D4A574' },
  { id: '11', title: 'Google AI', url: 'https://aistudio.google.com', icon: 'sparkles', color: '#4285F4' },
  { id: '12', title: 'Kimi', url: 'https://kimi.com', icon: 'zap', color: '#00D4AA' },
  { id: '13', title: 'OpenAI', url: 'https://openai.com', icon: 'bot', color: '#10A37F' },
  { id: '14', title: 'Krater', url: 'https://krater.ai', icon: 'orbit', color: '#8B5CF6' },
];

const generateId = () => Math.random().toString(36).substring(2, 9);

function loadBookmarks(): Bookmark[] {
  try {
    const saved = localStorage.getItem('axe_browser_bookmarks');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [
    { id: 'b1', title: 'AXE Core', url: 'https://axe-core-rust.vercel.app', favicon: '', folder: 'AXE', createdAt: Date.now() },
    { id: 'b2', title: 'Supabase Dashboard', url: 'https://supabase.com/dashboard', favicon: '', folder: 'Dev', createdAt: Date.now() },
    { id: 'b3', title: 'Vercel Dashboard', url: 'https://vercel.com/dashboard', favicon: '', folder: 'Dev', createdAt: Date.now() },
    { id: 'b4', title: 'GitHub', url: 'https://github.com', favicon: '', folder: 'Dev', createdAt: Date.now() },
  ];
}

function loadHistory(): HistoryEntry[] {
  try {
    const saved = localStorage.getItem('axe_browser_history');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [
    { id: 'h1', title: 'Google', url: 'https://www.google.com', favicon: '', timestamp: Date.now() - 3600000 },
    { id: 'h2', title: 'GitHub', url: 'https://github.com', favicon: '', timestamp: Date.now() - 7200000 },
    { id: 'h3', title: 'Supabase', url: 'https://supabase.com', favicon: '', timestamp: Date.now() - 86400000 },
  ];
}

export function useBrowserStore() {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: generateId(),
      title: 'Google',
      url: 'https://www.google.com',
      favicon: '',
      isActive: true,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hey! I\'m AXE AI, your browsing companion. I can help you search, summarize pages, explain content, or just chat. What would you like to do?',
      timestamp: Date.now(),
    },
  ]);
  const [aiMode, setAiMode] = useState<AIMode>('ask');
  const [quickLinks] = useState<QuickLink[]>(DEFAULT_QUICK_LINKS);
  const [isHome, setIsHome] = useState(false);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  const [downloads, setDownloads] = useState<DownloadItem[]>([
    { id: 'd1', filename: 'axe-component.zip', url: '#', size: '2.4 MB', progress: 100, status: 'completed', timestamp: Date.now() - 1800000 },
    { id: 'd2', filename: 'trading-os-data.csv', url: '#', size: '15.7 MB', progress: 67, status: 'downloading', timestamp: Date.now() - 300000 },
  ]);

  const [activePanel, setActivePanel] = useState<SidebarPanel>('none');

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Persist bookmarks and history
  useEffect(() => {
    localStorage.setItem('axe_browser_bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    localStorage.setItem('axe_browser_history', JSON.stringify(history));
  }, [history]);

  const addTab = useCallback((url?: string, title?: string) => {
    const newTab: Tab = {
      id: generateId(),
      title: title || 'New Tab',
      url: url || '',
      favicon: '',
      isActive: true,
    };
    setTabs((prev) => prev.map((t) => ({ ...t, isActive: false })).concat(newTab));
    setActiveTabId(newTab.id);
    setIsHome(!url);
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length === 1) {
          const newTab: Tab = {
            id: generateId(),
            title: 'Google',
            url: 'https://www.google.com',
            favicon: '',
            isActive: true,
          };
          setActiveTabId(newTab.id);
          setIsHome(false);
          return [newTab];
        }
        const filtered = prev.filter((t) => t.id !== tabId);
        if (tabId === activeTabId) {
          const lastTab = filtered[filtered.length - 1];
          lastTab.isActive = true;
          setActiveTabId(lastTab.id);
          setIsHome(!lastTab.url);
        }
        return filtered;
      });
    },
    [activeTabId]
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setTabs((prev) =>
      prev.map((t) => ({ ...t, isActive: t.id === tabId }))
    );
    const tab = tabs.find((t) => t.id === tabId);
    setIsHome(!tab?.url);
  }, [tabs]);

  const navigateTo = useCallback((url: string, title?: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? { ...t, url, title: title || url, isActive: true }
          : t
      )
    );
    setIsHome(!url);

    if (url) {
      setHistory((prev) => [
        { id: generateId(), title: title || url, url, favicon: '', timestamp: Date.now() },
        ...prev.slice(0, 99),
      ]);
    }
  }, [activeTabId]);

  const sendAIMessage = useCallback((content: string) => {
    const userMsg: AIMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setAiMessages((prev) => [...prev, userMsg]);

    setTimeout(() => {
      const responses: Record<AIMode, string> = {
        ask: `I found some great results for "${content}". Here are the top sources and a quick summary of what I found...`,
        summarize: `Here's a summary of the current page:\n\n• Key point 1: The main topic covers...\n• Key point 2: Important details include...\n• Key point 3: The conclusion states...\n\nWould you like me to dive deeper into any specific section?`,
        explain: `Let me break that down for you:\n\n**${content}** refers to...\n\nIn simple terms, it works by...\n\nThe key concepts to understand are:\n1. First concept...\n2. Second concept...\n3. How they interact...`,
      };

      const assistantMsg: AIMessage = {
        id: generateId(),
        role: 'assistant',
        content: responses[aiMode],
        timestamp: Date.now(),
      };
      setAiMessages((prev) => [...prev, assistantMsg]);
    }, 800);
  }, [aiMode]);

  const addBookmark = useCallback((title: string, url: string, folder = 'Default') => {
    setBookmarks((prev) => [
      { id: generateId(), title, url, favicon: '', folder, createdAt: Date.now() },
      ...prev,
    ]);
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const addDownload = useCallback((filename: string, url: string, size: string) => {
    setDownloads((prev) => [
      { id: generateId(), filename, url, size, progress: 0, status: 'downloading', timestamp: Date.now() },
      ...prev,
    ]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const clearDownloads = useCallback(() => {
    setDownloads((prev) => prev.filter((d) => d.status === 'downloading'));
  }, []);

  return {
    tabs,
    activeTab,
    activeTabId,
    showAIPanel,
    aiMessages,
    aiMode,
    quickLinks,
    isHome,
    bookmarks,
    history,
    downloads,
    activePanel,
    setShowAIPanel,
    setAiMode,
    setActivePanel,
    addTab,
    closeTab,
    switchTab,
    navigateTo,
    sendAIMessage,
    addBookmark,
    removeBookmark,
    addDownload,
    clearHistory,
    clearDownloads,
    addAIResponse: sendAIMessage, // alias for backward compat
  };
}
