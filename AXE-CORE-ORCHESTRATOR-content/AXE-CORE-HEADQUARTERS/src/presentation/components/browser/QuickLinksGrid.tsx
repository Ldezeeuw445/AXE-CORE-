import {
  Search, Code, Triangle, Database, Shield, Train, Mail,
  MessageSquare, Compass, Flame, Sparkles, Zap, Bot, Orbit
} from 'lucide-react';
import { Panel } from '@/presentation/components/surface/Surface';
import type { QuickLink } from '@/domain/types/browser';

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
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
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))] max-w-4xl">
      {links.map((link) => {
        const Icon = iconMap[link.icon] || Search;
        return (
          <button
            key={link.id}
            onClick={() => onNavigate(link.url, link.title)}
            className="group cursor-pointer text-left"
          >
            <Panel inset className="flex flex-col items-center gap-2 p-3 transition-transform duration-150 group-hover:scale-[1.02]">
              <div
                className="w-9 h-9 rounded-card flex items-center justify-center bg-axe-line-fill"
                style={{ boxShadow: `0 0 16px ${link.color ?? '#22D3EE'}22` }}
              >
                <Icon className="w-4 h-4" style={{ color: link.color || '#22D3EE' }} />
              </div>
              <span className="text-axe-meta font-medium text-axe-text-secondary group-hover:text-axe-text-primary truncate max-w-full text-center">
                {link.title}
              </span>
            </Panel>
          </button>
        );
      })}

      <button onClick={onAddFavorite} className="group cursor-pointer text-left">
        <Panel inset className="flex flex-col items-center gap-2 p-3 border-dashed group-hover:border-axe-tint-line transition-colors">
          <div className="w-9 h-9 rounded-card border border-axe-tint-line flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-axe-accent-cyan" />
          </div>
          <span className="text-axe-meta text-axe-accent-cyan">Add</span>
        </Panel>
      </button>
    </div>
  );
}
