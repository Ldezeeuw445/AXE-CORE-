import { ChevronLeft, ChevronRight, RefreshCw, Home, Download, Settings, PanelRight } from 'lucide-react';

interface NavigationBarProps {
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onHome: () => void;
  onToggleAI: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  aiOpen: boolean;
}

export default function NavigationBar({
  onBack,
  onForward,
  onRefresh,
  onHome,
  onToggleAI,
  canGoBack,
  canGoForward,
  aiOpen,
}: NavigationBarProps) {
  return (
    <div className="flex items-center gap-1 px-2">
      <button
        onClick={onBack}
        disabled={!canGoBack}
        className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4 text-white/70" />
      </button>
      <button
        onClick={onForward}
        disabled={!canGoForward}
        className="p-1.5 rounded-md hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all cursor-pointer"
      >
        <ChevronRight className="w-4 h-4 text-white/70" />
      </button>
      <button
        onClick={onRefresh}
        className="p-1.5 rounded-md hover:bg-white/10 transition-all cursor-pointer"
      >
        <RefreshCw className="w-4 h-4 text-white/70" />
      </button>
      <button
        onClick={onHome}
        className="p-1.5 rounded-md hover:bg-white/10 transition-all cursor-pointer"
      >
        <Home className="w-4 h-4 text-white/70" />
      </button>

      <div className="w-px h-5 bg-white/10 mx-1" />

      <button
        onClick={onToggleAI}
        className={`
          p-1.5 rounded-md transition-all cursor-pointer relative
          ${aiOpen ? 'bg-cyan-400/20 text-cyan-400' : 'hover:bg-white/10 text-white/70'}
        `}
      >
        <PanelRight className="w-4 h-4" />
        {!aiOpen && (
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse-glow" />
        )}
      </button>
      <button
        className="p-1.5 rounded-md hover:bg-white/10 transition-all cursor-pointer"
      >
        <Download className="w-4 h-4 text-white/70" />
      </button>
      <button
        className="p-1.5 rounded-md hover:bg-white/10 transition-all cursor-pointer"
      >
        <Settings className="w-4 h-4 text-white/70" />
      </button>
    </div>
  );
}
