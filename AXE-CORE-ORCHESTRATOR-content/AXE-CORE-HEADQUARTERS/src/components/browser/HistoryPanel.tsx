import { X, Clock, FileText, Trash2 } from 'lucide-react';
import type { HistoryEntry } from '@/types/browser';

interface HistoryPanelProps {
  history: HistoryEntry[];
  onNavigate: (url: string, title: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

export default function HistoryPanel({ history, onNavigate, onClearHistory, onClose }: HistoryPanelProps) {
  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="h-full w-full bg-[#0a0a0c] border-r border-white/[0.06] flex flex-col z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white capitalize">History</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClearHistory} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Clear history">
            <Trash2 className="w-3.5 h-3.5 text-white/40" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5 text-white/40" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-white/30">
            <Clock className="w-8 h-8 mb-2" />
            <p className="text-xs">No history yet</p>
          </div>
        )}
        {history.map((entry) => (
          <div
            key={entry.id}
            onClick={() => onNavigate(entry.url, entry.title)}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg 
              hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
              <FileText className="w-3 h-3 text-white/40" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white/80 truncate">{entry.title}</p>
              <p className="text-[10px] text-white/30 truncate">{new URL(entry.url).hostname}</p>
            </div>
            <span className="text-[10px] text-white/20 flex-shrink-0">{formatTime(entry.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
