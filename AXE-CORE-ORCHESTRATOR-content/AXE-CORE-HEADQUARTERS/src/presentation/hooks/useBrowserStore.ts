import { useState, useCallback, useEffect } from 'react';
import type { Tab, AIMessage, QuickLink, Bookmark, HistoryEntry, DownloadItem, AIMode, SidebarPanel } from '@/domain/types/browser';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { callProvider, callWithFallback } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { cascadeAround } from '@/domain/providers';
import { apiUrl } from '@/infrastructure/config/apiUrl';

/** Best-effort fetch of the current page's readable text so the agent can
 *  actually reason about what's on screen (not just its URL). Uses the same
 *  /api/browse proxy the WebView uses; fails silently to keep chat responsive. */
async function fetchPageContext(url: string): Promise<string> {
  if (!url) return '';
  try {
    const res = await fetch(apiUrl(`/api/browse?url=${encodeURIComponent(url)}`), { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return '';
    const d = await res.json() as { title?: string; text?: string };
    if (!d.text) return '';
    return `Current page: ${d.title ?? url} (${url})\n\nPage content:\n${d.text.slice(0, 6000)}`;
  } catch {
    return '';
  }
}

const AGENT_SYSTEM: Record<AIMode, string> = {
  ask: 'You are AXE, an in-browser AI assistant. Answer the user clearly and concisely. If page content is provided, ground your answer in it; otherwise use your own knowledge and say so. Reply in the user\'s language.',
  summarize: 'You are AXE, an in-browser AI assistant. Summarize the provided page content as tight bullet points capturing the key facts. If no page content is provided, say you need a page open first. Reply in the user\'s language.',
  explain: 'You are AXE, an in-browser AI assistant. Explain the topic (and any provided page content) in plain, simple terms with a short structure. Reply in the user\'s language.',
};

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
      title: 'New Tab',
      url: '',
      favicon: '',
      isActive: true,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hey — I\'m AXE. Ask me anything about the web, or pick a composer on the start page to talk to DeepSeek, Browser Use, or Camofox directly.',
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
            title: 'New Tab',
            url: '',
            favicon: '',
            isActive: true,
          };
          setActiveTabId(newTab.id);
          setIsHome(true);
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
    const userMsg: AIMessage = { id: generateId(), role: 'user', content, timestamp: Date.now() };
    const pendingId = generateId();
    setAiMessages((prev) => [
      ...prev,
      userMsg,
      { id: pendingId, role: 'assistant', content: '…', timestamp: Date.now() },
    ]);

    const replacePending = (text: string) =>
      setAiMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, content: text } : m)));

    void (async () => {
      // Reuse the app's configured model chain — the browser agent is no longer
      // a separate mock; it talks to whatever provider the user set up in
      // Settings (primary + fallbacks), so one key config powers everything.
      const vs = useVoiceStore.getState();
      const slots = [vs.primarySlot, vs.fallback1Slot, vs.fallback2Slot, vs.fallback3Slot].filter(
        (s): s is KeySlot => !!s?.key,
      );
      if (slots.length === 0) {
        replacePending('Er is nog geen AI-model geconfigureerd. Ga naar Settings → Keys, vul een provider-key in (bijv. Gemini of Groq) en test hem. Daarna werkt de browser-agent hier direct.');
        return;
      }

      const url = tabs.find((t) => t.id === activeTabId)?.url ?? '';
      // Only fetch page text when it's relevant (summarize/explain, or the user
      // references "this page"). Keeps plain questions fast.
      const wantsPage = aiMode !== 'ask' || /deze pagina|this page|hier|samenvat|summari|leg uit|explain/i.test(content);
      const pageCtx = wantsPage ? await fetchPageContext(url) : '';

      const messages = [
        { role: 'system' as const, content: AGENT_SYSTEM[aiMode] + (url ? `\n\nThe user is currently on: ${url}` : '') },
        ...(pageCtx ? [{ role: 'system' as const, content: pageCtx }] : []),
        { role: 'user' as const, content },
      ];

      let lastErr = '';
      for (const slot of slots) {
        try {
          const answer = await callWithFallback(cascadeAround(slot), messages);
          if (answer?.trim()) { replacePending(answer.trim()); return; }
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
        }
      }
      replacePending(`Kon geen antwoord ophalen${lastErr ? ` (${lastErr.slice(0, 120)})` : ''}. Check je AI-key in Settings.`);
    })();
  }, [aiMode, tabs, activeTabId]);

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

  const appendAIMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setAiMessages((prev) => [
      ...prev,
      { id: generateId(), role, content, timestamp: Date.now() },
    ]);
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
    appendAIMessage,
    addBookmark,
    removeBookmark,
    addDownload,
    clearHistory,
    clearDownloads,
    addAIResponse: sendAIMessage, // alias for backward compat
  };
}
