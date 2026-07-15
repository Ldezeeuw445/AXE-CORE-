import {
  Search, Code, Triangle, Database, Shield, Train, Mail,
  MessageSquare, Compass, Flame, Sparkles, Zap, Bot, Orbit
} from 'lucide-react';
import type { QuickLink } from '@/types/browser';

const iconMap: Record<string, React.ElementType> = {
  search: Search,
  code: Code,
  triangle: Triangle,
  database: Database,
  shield: Shield,
  train: Train,
  mail: Mail,
  'message-square': MessageSquare,
  compass: Compass,
  flame: Flame,
  sparkles: Sparkles,
  zap: Zap,
  bot: Bot,
  orbit: Orbit,
};

interface QuickLinksGridProps {
  links: QuickLink[];
  onNavigate: (url: string, title: string) => void;
  onAddFavorite: () => void;
}

export default function QuickLinksGrid({ links, onNavigate, onAddFavorite }: QuickLinksGridProps) {
  return (
    <div className="grid grid-cols-4 gap-3 max-w-[580px] mx-auto">
      {links.map((link) => {
        const Icon = iconMap[link.icon] || Search;
        return (
          <button
            key={link.id}
            onClick={() => onNavigate(link.url, link.title)}
            className="group flex flex-col items-center gap-2.5 p-3.5 rounded-2xl 
              bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm
              hover:bg-white/[0.08] hover:border-cyan-400/30 hover:scale-105 
              transition-all duration-200 cursor-pointer"
          >
            <div 
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-all
                group-hover:shadow-[0_0_12px_rgba(0,255,255,0.2)]"
              style={{ backgroundColor: `${link.color || '#00ffff'}15` }}
            >
              <Icon
                className="w-5 h-5 transition-colors"
                color={link.color || '#00ffff'}
              />
            </div>

            <span className="text-[11px] font-medium text-white/60 group-hover:text-white/90 transition-colors truncate max-w-full">
              {link.title}
            </span>
          </button>
        );
      })}

      {/* Add Favorite */}
      <button
        onClick={onAddFavorite}
        className="group flex flex-col items-center gap-2.5 p-3.5 rounded-2xl 
          border border-dashed border-white/[0.08] hover:border-cyan-400/40
          hover:bg-cyan-400/5 hover:scale-105 transition-all duration-200 cursor-pointer"
      >
        <div className="w-11 h-11 rounded-xl border-2 border-cyan-400/30 
          flex items-center justify-center group-hover:border-cyan-400/60 transition-all">
          <Sparkles className="w-5 h-5 text-cyan-400/60 group-hover:text-cyan-400" />
        </div>
        <span className="text-[11px] font-medium text-cyan-400/50 group-hover:text-cyan-400 transition-colors">
          Add
        </span>
      </button>
    </div>
  );
}
