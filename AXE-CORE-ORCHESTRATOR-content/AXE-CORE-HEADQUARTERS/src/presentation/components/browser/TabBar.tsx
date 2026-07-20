import { X, Plus } from 'lucide-react';
import type { Tab } from '@/domain/types/browser';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
}

export default function TabBar({
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onAddTab,
}: TabBarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 h-10 overflow-x-auto scrollbar-thin">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSwitchTab(tab.id)}
          className={`
            group relative flex items-center gap-2 px-3 py-1.5 min-w-[160px] max-w-[200px] 
            rounded-t-lg cursor-pointer select-none transition-all duration-150
            ${tab.id === activeTabId ? 'tab-active' : 'tab-inactive'}
          `}
        >
          {tab.favicon && (
            <img
              src={tab.favicon}
              alt=""
              className="w-4 h-4 rounded-sm flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          {!tab.favicon && tab.url && (
            <div className="w-4 h-4 rounded-sm flex-shrink-0 bg-gradient-to-br from-cyan-400 to-purple-500" />
          )}
          <span className="text-[13px] font-medium text-white/80 truncate flex-1">
            {tab.title || 'New Tab'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-white/10 transition-all"
          >
            <X className="w-3 h-3 text-white/60" />
          </button>
        </div>
      ))}
      <button
        onClick={onAddTab}
        className="p-1.5 rounded-md hover:bg-white/10 transition-colors ml-1"
      >
        <Plus className="w-4 h-4 text-white/60" />
      </button>
    </div>
  );
}
