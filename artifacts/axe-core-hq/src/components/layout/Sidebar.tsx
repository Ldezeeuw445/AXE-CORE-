import { ExternalLink, Zap, Activity, Globe, Code, FileCode, Bot, Wrench, Search, Braces } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsTablet } from '@/hooks/use-tablet';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { BrowserPanel } from '@/components/axe-core/BrowserPanel';
import { CodeAgentPanel } from '@/components/axe-core/CodeAgentPanel';
import { KimiToolsPanel } from '@/components/axe-core/KimiToolsPanel';

export function Sidebar() {
  const { leftDrawerOpen, setLeftDrawerOpen } = useUIStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Below the desktop breakpoint (<1024px), the tool drawer overlays instead of
  // permanently eating fixed-width space — otherwise sidebar + right panel alone
  // can consume most of an iPad's viewport width.
  const isCompact = isMobile || isTablet;

  const content = (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#000000' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wrench size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--text-primary)' }}>
            Tools
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-0 space-y-2">
        <WidgetCard title="BROWSER" icon={<Globe size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <BrowserPanel />
        </WidgetCard>

        <WidgetCard title="CODE AGENT" icon={<Code size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <CodeAgentPanel />
        </WidgetCard>

        <WidgetCard title="KIMI TOOLS" icon={<Braces size={12} style={{ color: 'var(--accent-cyan)' }} />}>
          <KimiToolsPanel />
        </WidgetCard>
      </div>
    </div>
  );

  if (isCompact) {
    return (
      <Sheet open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen}>
        <SheetContent
          side="left"
          className="bg-black text-white border-r border-white/5 w-[280px] max-w-[85vw] p-0"
          style={{ backgroundColor: '#000000' }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Tools</SheetTitle>
            <SheetDescription>Browser, Code Agent, and Kimi Tools</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        width: '240px',
        backgroundColor: '#000000',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {content}
    </aside>
  );
}
