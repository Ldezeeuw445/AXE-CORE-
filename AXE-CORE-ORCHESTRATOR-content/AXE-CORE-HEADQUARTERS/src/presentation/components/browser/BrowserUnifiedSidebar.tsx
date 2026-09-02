import {
  Bookmark,
  Download,
  ExternalLink,
  Globe,
  History,
  Menu,
  Plus,
  Settings,
  User,
  X,
} from 'lucide-react';
import { Panel, IconButton } from '@/presentation/components/surface/Surface';
import type { Bookmark as BookmarkType, DownloadItem, HistoryEntry, SidebarPanel } from '@/domain/types/browser';

const TAB_GROUPS = [
  {
    name: 'Media',
    rgb: '34 211 238',
    tabs: [
      { label: 'YouTube', url: 'https://youtube.com' },
      { label: 'YouTube Music', url: 'https://music.youtube.com' },
      { label: 'Apple TV', url: 'https://tv.apple.com' },
    ],
  },
  {
    name: 'G-Suite',
    rgb: '59 130 246',
    tabs: [
      { label: 'Drive', url: 'https://drive.google.com' },
      { label: 'Docs', url: 'https://docs.google.com' },
      { label: 'Sheets', url: 'https://sheets.google.com' },
    ],
  },
  {
    name: 'Work',
    rgb: '34 211 238',
    tabs: [
      { label: 'GitHub', url: 'https://github.com' },
      { label: 'Notion', url: 'https://notion.so' },
      { label: 'Outlook', url: 'https://outlook.live.com' },
    ],
  },
];

const QUICK_LINKS = [
  { label: 'Google', url: 'https://google.com' },
  { label: 'Reddit', url: 'https://reddit.com' },
  { label: 'Discord', url: 'https://discord.com' },
];

interface BrowserUnifiedSidebarProps {
  onNavigate: (url: string, title?: string) => void;
  onOpenInApp?: () => void;
  standalone?: boolean;
  currentUrl?: string;
  activePanel?: SidebarPanel;
  onTogglePanel?: (panel: SidebarPanel) => void;
  bookmarks?: BookmarkType[];
  history?: HistoryEntry[];
  downloads?: DownloadItem[];
  onRemoveBookmark?: (id: string) => void;
  onClearHistory?: () => void;
  onClearDownloads?: () => void;
}

/** One Zen-style sidebar panel — AXE Surface colors, pill tab groups. */
export function BrowserUnifiedSidebar({
  onNavigate,
  onOpenInApp,
  standalone = false,
  currentUrl = '',
  activePanel = 'none',
  onTogglePanel,
  bookmarks = [],
  history = [],
  downloads = [],
  onRemoveBookmark,
  onClearHistory,
  onClearDownloads,
}: BrowserUnifiedSidebarProps) {
  const navTools = [
    { icon: Bookmark, label: 'Bookmarks', panel: 'bookmarks' as const },
    { icon: History, label: 'History', panel: 'history' as const },
    { icon: Download, label: 'Downloads', panel: 'downloads' as const },
  ];

  const showInlinePanel = !standalone && activePanel !== 'none';

  return (
    <aside className="w-[240px] flex-shrink-0 flex flex-col py-3 pl-3 pr-1 z-10">
      <Panel flat className="h-full flex flex-col gap-3 p-3 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            {standalone && (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500/80" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
                <div className="w-2 h-2 rounded-full bg-green-500/80" />
              </>
            )}
            <div className="w-7 h-7 rounded-button bg-[rgba(34,211,238,.14)] flex items-center justify-center ml-1">
              <span className="text-[9px] font-bold text-axe-accent-ice">◆</span>
            </div>
          </div>
          <IconButton aria-label="Menu" title="Menu">
            <Menu className="w-4 h-4" />
          </IconButton>
        </div>

        {/* URL pill */}
        <button
          type="button"
          onClick={() => onNavigate(currentUrl || 'https://google.com', 'Search')}
          className="axe-url-pill shrink-0 truncate"
        >
          {currentUrl || 'Search or enter address…'}
        </button>

        {/* Scrollable body — one panel, no second sidebar */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-2">
          {showInlinePanel && activePanel === 'bookmarks' && (
            <InlinePanel title="Bookmarks" onClose={() => onTogglePanel?.('none')}>
              {bookmarks.length === 0 ? (
                <p className="text-axe-meta text-axe-text-muted px-2 py-1">No bookmarks yet</p>
              ) : (
                bookmarks.map((bm) => (
                  <button
                    key={bm.id}
                    type="button"
                    onClick={() => onNavigate(bm.url, bm.title)}
                    className="axe-tab-group__tab group"
                  >
                    <span className="axe-glyph text-[10px]">{bm.title[0]}</span>
                    <span className="truncate">{bm.title}</span>
                    {onRemoveBookmark && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onRemoveBookmark(bm.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRemoveBookmark(bm.id); } }}
                        className="ml-auto opacity-0 group-hover:opacity-100 text-axe-text-muted hover:text-axe-err"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                ))
              )}
            </InlinePanel>
          )}

          {showInlinePanel && activePanel === 'history' && (
            <InlinePanel title="History" onClose={() => onTogglePanel?.('none')}>
              {history.length === 0 ? (
                <p className="text-axe-meta text-axe-text-muted px-2 py-1">No history</p>
              ) : (
                history.slice(0, 20).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onNavigate(entry.url, entry.title)}
                    className="axe-tab-group__tab"
                  >
                    <span className="truncate">{entry.title || entry.url}</span>
                  </button>
                ))
              )}
              {onClearHistory && history.length > 0 && (
                <button type="button" onClick={onClearHistory} className="axe-ghost w-full mt-1 text-axe-meta">
                  Clear history
                </button>
              )}
            </InlinePanel>
          )}

          {showInlinePanel && activePanel === 'downloads' && (
            <InlinePanel title="Downloads" onClose={() => onTogglePanel?.('none')}>
              {downloads.length === 0 ? (
                <p className="text-axe-meta text-axe-text-muted px-2 py-1">No downloads</p>
              ) : (
                downloads.map((d) => (
                  <div key={d.id} className="axe-tab-group__tab !cursor-default">
                    <span className="truncate">{d.filename}</span>
                  </div>
                ))
              )}
              {onClearDownloads && downloads.length > 0 && (
                <button type="button" onClick={onClearDownloads} className="axe-ghost w-full mt-1 text-axe-meta">
                  Clear downloads
                </button>
              )}
            </InlinePanel>
          )}

          {!showInlinePanel && (
            <>
              <button
                type="button"
                onClick={() => onNavigate('', 'New Tab')}
                className="axe-primary !py-2 !text-surface-body shrink-0"
              >
                <Plus className="w-4 h-4" />
                New tab
              </button>

              {!standalone && onTogglePanel && (
                <div className="flex flex-col gap-0.5">
                  {navTools.map(({ icon: Icon, label, panel }) => {
                    const active = activePanel === panel;
                    return (
                      <button
                        key={panel}
                        type="button"
                        onClick={() => onTogglePanel(active ? 'none' : panel)}
                        className="axe-row"
                        data-active={active || undefined}
                      >
                        <span className="axe-glyph"><Icon className="w-3.5 h-3.5" /></span>
                        <span className="axe-row__text"><b>{label}</b></span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="axe-divide my-1" />

              {QUICK_LINKS.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => onNavigate(link.url, link.label)}
                  className="axe-row !py-1.5"
                >
                  <span className="axe-glyph text-[10px]">{link.label[0]}</span>
                  <span className="axe-row__text"><b>{link.label}</b></span>
                </button>
              ))}

              {TAB_GROUPS.map((group) => (
                <div
                  key={group.name}
                  className="axe-tab-group"
                  style={{ ['--group-rgb' as string]: group.rgb }}
                >
                  <div className="axe-tab-group__label">
                    <Globe className="w-3.5 h-3.5 opacity-70" />
                    {group.name}
                  </div>
                  <div className="axe-tab-group__stack">
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.label}
                        type="button"
                        onClick={() => onNavigate(tab.url, tab.label)}
                        className="axe-tab-group__tab"
                      >
                        <span className="axe-glyph text-[10px]">{tab.label[0]}</span>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex flex-col gap-1 pt-1 border-t border-axe-line">
          {standalone && onOpenInApp && (
            <button type="button" onClick={onOpenInApp} className="axe-row !py-1.5">
              <span className="axe-glyph"><ExternalLink className="w-3.5 h-3.5" /></span>
              <span className="axe-row__text"><b>Open in app</b></span>
            </button>
          )}
          <button type="button" className="axe-row !py-1.5">
            <span className="axe-glyph"><Settings className="w-3.5 h-3.5" /></span>
            <span className="axe-row__text"><b>Settings</b></span>
          </button>
          <button type="button" className="axe-row !py-1.5">
            <span className="axe-glyph"><User className="w-3.5 h-3.5" /></span>
            <span className="axe-row__text"><b>Profile</b></span>
          </button>
        </div>
      </Panel>
    </aside>
  );
}

function InlinePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-h-0">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="axe-label">{title}</span>
        <IconButton onClick={onClose} aria-label={`Close ${title}`}>
          <X className="w-3.5 h-3.5" />
        </IconButton>
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
