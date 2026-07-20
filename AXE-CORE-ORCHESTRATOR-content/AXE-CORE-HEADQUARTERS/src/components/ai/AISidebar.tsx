import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Zap, FileText, HelpCircle, X, Settings, Loader2, CheckCircle2, AlertCircle, Navigation, Search, Bookmark, Globe } from 'lucide-react';
import type { AIMessage, AIMode } from '@/domain/types/browser';
import type { AIConfig } from '@/hooks/useAIConfig';
import { sendToAI, PROVIDER_PRESETS } from '@/application/agents/aiAgent';
import type { ToolResult } from '@/application/agents/tools';
import gsap from 'gsap';

interface AISidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: AIMessage[];
  mode: AIMode;
  onModeChange: (mode: AIMode) => void;
  onSendMessage: (content: string) => void;
  currentUrl: string;
  aiConfig: AIConfig;
  onOpenSettings: () => void;
  onNavigate: (url: string, title?: string) => void;
  onSearch: (query: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
  onBookmark: (title?: string, folder?: string) => void;
  onOpenBookmark: (name: string) => void;
  onNewTab: (url?: string) => void;
  onCloseTab: (index: string) => void;
  onSwitchTab: (index: string) => void;
  tabs: Array<{ title: string; url: string }>;
  bookmarks: Array<{ title: string; url: string; folder: string }>;
  history: Array<{ title: string; url: string }>;
}

const modeConfig: { id: AIMode; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: 'ask', label: 'Ask AXE', icon: Zap, desc: 'Search & ask anything' },
  { id: 'summarize', label: 'Summarize', icon: FileText, desc: 'Summarize this page' },
  { id: 'explain', label: 'Explain', icon: HelpCircle, desc: 'Explain selected content' },
];

const ToolIcon = ({ tool }: { tool: string }) => {
  if (tool === 'navigate' || tool === 'open_quick_link' || tool === 'open_bookmark') return <Navigation className="w-3 h-3 text-cyan-400" />;
  if (tool === 'search') return <Search className="w-3 h-3 text-cyan-400" />;
  if (tool === 'bookmark') return <Bookmark className="w-3 h-3 text-cyan-400" />;
  if (tool === 'new_tab' || tool === 'close_tab' || tool === 'switch_tab' || tool === 'list_tabs') return <Globe className="w-3 h-3 text-cyan-400" />;
  return <CheckCircle2 className="w-3 h-3 text-green-400" />;
};

export default function AISidebar({
  isOpen, onClose, messages, mode, onModeChange, onSendMessage,
  currentUrl, aiConfig, onOpenSettings, onNavigate, onSearch,
  onGoBack, onGoForward, onRefresh, onBookmark, onOpenBookmark,
  onNewTab, onCloseTab, onSwitchTab, tabs, bookmarks, history,
}: AISidebarProps) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) {
      gsap.to(panelRef.current, { x: isOpen ? 0 : 360, duration: 0.4, ease: 'power2.out' });
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, toolResults]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userContent = inputValue.trim();
    onSendMessage(userContent);
    setInputValue('');
    setIsLoading(true);
    setToolResults([]);

    const convMessages = messages
      .filter(m => m.id !== 'welcome')
      .slice(-20)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const result = await sendToAI(
      aiConfig,
      [...convMessages, { role: 'user', content: userContent }],
      mode,
      currentUrl,
      {
        tabs: tabs.map(t => t.title),
        bookmarks: bookmarks.map(b => ({ title: b.title, url: b.url, folder: b.folder })),
        history: history.map(h => ({ title: h.title, url: h.url })),
      },
      {
        navigate: onNavigate,
        search: onSearch,
        goBack: onGoBack,
        goForward: onGoForward,
        refresh: onRefresh,
        bookmark: onBookmark,
        openBookmark: onOpenBookmark,
        historySearch: (q) => history.filter(h => h.title.toLowerCase().includes(q.toLowerCase())).map(h => h.title),
        summarizePage: () => {},
        explainSelection: () => {},
        openQuickLink: (name) => {
          const links: Record<string, string> = {
            google: 'https://www.google.com',
            github: 'https://github.com',
            vercel: 'https://vercel.com',
            supabase: 'https://supabase.com',
            cloudflare: 'https://dash.cloudflare.com',
            railway: 'https://railway.app',
            resend: 'https://resend.com',
            chatgpt: 'https://chatgpt.com',
            perplexity: 'https://perplexity.ai',
            claude: 'https://claude.ai',
            'google ai': 'https://aistudio.google.com',
            'google ai studio': 'https://aistudio.google.com',
            kimi: 'https://kimi.com',
            openai: 'https://openai.com',
            krater: 'https://krater.ai',
          };
          const match = Object.entries(links).find(([k]) => name.toLowerCase().includes(k));
          if (match) onNavigate(match[1], name);
        },
        newTab: onNewTab,
        closeTab: onCloseTab,
        switchTab: onSwitchTab,
        listTabs: () => tabs.map(t => t.title),
      }
    );

    if (result.toolResults && result.toolResults.length > 0) {
      setToolResults(result.toolResults);
    }

    if (result.message) {
      onSendMessage(result.message);
    }

    setIsLoading(false);
  }, [inputValue, isLoading, messages, onSendMessage, aiConfig, mode, currentUrl, tabs, bookmarks, history, onNavigate, onSearch, onGoBack, onGoForward, onRefresh, onBookmark, onOpenBookmark, onNewTab, onCloseTab, onSwitchTab]);

  const handleQuickAction = (prompt: string) => {
    setInputValue(prompt);
  };

  return (
    <div ref={panelRef} className="fixed right-0 top-0 h-full w-[380px] bg-[#0a0a0c] border-l border-white/[0.08] flex flex-col z-50 translate-x-[380px]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bot className="w-5 h-5 text-cyan-400" />
            <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0c] ${
              aiConfig.isConfigured ? 'bg-green-400' : 'bg-yellow-400'
            }`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">AXE AI</h3>
            <p className="text-[10px] text-white/40">
              {aiConfig.isConfigured
                ? `${PROVIDER_PRESETS.find(p => p.endpoint === aiConfig.apiEndpoint)?.name || 'Custom'} • ${aiConfig.model}`
                : 'Not configured'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onOpenSettings} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer" title="AI Settings">
            <Settings className="w-4 h-4 text-white/40" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 p-3 border-b border-white/[0.08]">
        {modeConfig.map((m) => {
          const Icon = m.icon;
          return (
            <button key={m.id} onClick={() => onModeChange(m.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[11px] font-medium transition-all duration-200 cursor-pointer
                ${mode === m.id ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/30' : 'text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent'}`}>
              <Icon className="w-4 h-4" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {!aiConfig.isConfigured && (
        <div className="mx-3 mt-3 p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <p className="text-[12px] text-yellow-400/80">Add your API key to enable AXE AI</p>
          </div>
          <button onClick={onOpenSettings}
            className="w-full h-8 rounded-lg bg-yellow-400/10 border border-yellow-400/20 text-[12px] font-medium text-yellow-400 hover:bg-yellow-400/20 transition-all cursor-pointer">
            Configure AI
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {messages.map((msg, idx) => (
          <div key={msg.id + idx} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5
              ${msg.role === 'assistant' ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20' : 'bg-white/10'}`}>
              {msg.role === 'assistant'
                ? <Bot className="w-3.5 h-3.5 text-cyan-400" />
                : <User className="w-3.5 h-3.5 text-white/60" />}
            </div>
            <div className={`max-w-[280px] px-3 py-2 rounded-xl text-[12px] leading-relaxed
              ${msg.role === 'assistant'
                ? 'bg-white/5 text-white/85 border-l-[1.5px] border-cyan-400/40'
                : 'bg-cyan-400/10 text-white/85'
              }`}>
              {msg.content.split('\n').map((line, i) => (
                <p key={i} className={line.startsWith('•') || line.match(/^\d\./) ? 'ml-2 mt-0.5 text-white/70' : i > 0 ? 'mt-1' : ''}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}

        {toolResults.length > 0 && (
          <div className="space-y-1.5">
            {toolResults.map((tr, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-400/5 border border-cyan-400/10">
                <ToolIcon tool={tr.tool} />
                <span className="text-[11px] text-cyan-400/80">{tr.message}</span>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="max-w-[280px] px-3 py-2 rounded-xl bg-white/5 border-l-[1.5px] border-cyan-400/40">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                <span className="text-[12px] text-white/50">AXE is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {currentUrl && aiConfig.isConfigured && (
        <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
          {['Summarize this', 'Explain this', 'Bookmark this'].map((label) => (
            <button key={label} onClick={() => handleQuickAction(label)}
              className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/40 hover:text-cyan-400 hover:border-cyan-400/30 transition-all cursor-pointer">
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="p-3.5 border-t border-white/[0.08]">
        {currentUrl && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded bg-white/[0.03]">
            <Globe className="w-3 h-3 text-white/30 flex-shrink-0" />
            <span className="text-[10px] text-white/30 truncate">
              {currentUrl ? new URL(currentUrl).hostname : 'No page loaded'}
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
            placeholder={aiConfig.isConfigured ? 'Ask AXE anything...' : 'Configure AI first...'}
            disabled={!aiConfig.isConfigured || isLoading}
            className="flex-1 h-9 px-3.5 rounded-xl bg-white/5 border border-white/[0.08] text-[12px] text-white placeholder:text-white/25 outline-none
              focus:border-cyan-400/50 transition-all disabled:opacity-40" />
          <button type="submit" disabled={!inputValue.trim() || !aiConfig.isConfigured || isLoading}
            className="w-9 h-9 rounded-xl bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center
              hover:bg-cyan-400/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer">
            {isLoading
              ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              : <Send className="w-4 h-4 text-cyan-400" />}
          </button>
        </form>
      </div>
    </div>
  );
}
