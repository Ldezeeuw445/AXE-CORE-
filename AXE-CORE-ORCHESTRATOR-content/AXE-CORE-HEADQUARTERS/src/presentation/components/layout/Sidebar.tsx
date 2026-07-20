import { ExternalLink, Zap, Activity, Globe, Code, FileCode, Bot, Wrench, Search, Braces, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore } from '@/presentation/store/uiStore';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useIsTablet } from '@/presentation/hooks/use-tablet';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/presentation/components/ui/sheet';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { BrowserPanel } from '@/presentation/components/axe-core/BrowserPanel';
import { CodeAgentPanel } from '@/presentation/components/axe-core/CodeAgentPanel';
import { KimiToolsPanel } from '@/presentation/components/axe-core/KimiToolsPanel';

export function Sidebar() {
  const { leftDrawerOpen, setLeftDrawerOpen, leftPanelOpen, toggleLeftPanel } = useUIStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isCompact = isMobile || isTablet;

  const content = (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#000000' }}>
      {/* Header with toggle button */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--text-primary)' }}>
            Tools
          </span>
        </div>
        {!isCompact && (
          <button
            onClick={toggleLeftPanel}
            className="p-1 rounded-md transition-colors hover:bg-white/5"
            title={leftPanelOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {leftPanelOpen ? (
              <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>
        )}
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

  // Desktop: collapsible sidebar
  if (!leftPanelOpen) {
    return (
      <aside
        className="flex-shrink-0 flex flex-col items-center py-3"
        style={{
          width: '36px',
          backgroundColor: '#000000',
          borderRight: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <button
          onClick={toggleLeftPanel}
          className="p-1.5 rounded-md transition-colors hover:bg-white/5 mb-2"
          title="Expand sidebar"
        >
          <ChevronRight size={14} style={{ color: 'var(--accent-cyan)' }} />
        </button>
        <div className="w-px h-4 bg-white/10 mb-2" />
        <div className="flex flex-col items-center gap-3">
          <span title="Browser" className="flex"><Globe size={14} style={{ color: 'var(--text-muted)' }} /></span>
          <span title="Code Agent" className="flex"><Code size={14} style={{ color: 'var(--text-muted)' }} /></span>
          <span title="Kimi Tools" className="flex"><Braces size={14} style={{ color: 'var(--text-muted)' }} /></span>
        </div>
      </aside>
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
