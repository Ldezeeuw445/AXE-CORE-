import { User, History, Download, Bookmark, Shield, HelpCircle, Globe } from 'lucide-react';
import type { SidebarPanel } from '@/domain/types/browser';

interface SidebarProps {
  onNavigate: (url: string, title: string) => void;
  activePanel: SidebarPanel;
  onTogglePanel: (panel: SidebarPanel) => void;
}

export default function Sidebar({ onNavigate, activePanel, onTogglePanel }: SidebarProps) {
  const navItems = [
    { icon: User, label: 'Profile', action: 'profile' as const },
    { icon: Bookmark, label: 'Bookmarks', panel: 'bookmarks' as const },
    { icon: History, label: 'History', panel: 'history' as const },
    { icon: Download, label: 'Downloads', panel: 'downloads' as const },
    { icon: Shield, label: 'Security', action: 'security' as const },
    { icon: HelpCircle, label: 'Help', action: 'help' as const },
  ];

  return (
    <div className="w-[60px] h-full bg-[#0a0a0c] border-r border-white/[0.06] flex flex-col items-center py-3 gap-1 z-30 flex-shrink-0">
      <button
        onClick={() => onNavigate('https://www.google.com', 'Google')}
        className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 
          flex items-center justify-center mb-5 shadow-[0_0_15px_rgba(0,255,255,0.35)]
          hover:shadow-[0_0_25px_rgba(0,255,255,0.5)] hover:scale-110 transition-all duration-300 cursor-pointer"
      >
        <Globe className="w-5 h-5 text-black" strokeWidth={2.5} />
      </button>

      <div className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.panel && activePanel === item.panel;
          return (
            <button
              key={item.label}
              onClick={() => {
                if (item.panel) {
                  onTogglePanel(isActive ? 'none' : item.panel);
                }
              }}
              className={`
                group relative w-11 h-11 rounded-xl flex items-center justify-center
                transition-all duration-200 cursor-pointer
                ${isActive 
                  ? 'bg-cyan-400/15 text-cyan-400' 
                  : 'hover:bg-white/[0.06] text-white/40 hover:text-white/70'
                }
              `}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
              
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-cyan-400 rounded-r-full" />
              )}
              
              <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-[#1a1a1f] border border-white/[0.08]
                text-[11px] font-medium text-white/80 whitespace-nowrap opacity-0 group-hover:opacity-100
                pointer-events-none transition-opacity z-50">
                {item.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
