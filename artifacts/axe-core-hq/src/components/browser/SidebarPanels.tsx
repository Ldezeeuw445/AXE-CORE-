import { useRef } from 'react';
import gsap from 'gsap';
import { useEffect } from 'react';
import type { SidebarPanel } from '@/types/browser';
import BookmarkPanel from './BookmarkPanel';
import HistoryPanel from './HistoryPanel';
import DownloadPanel from './DownloadPanel';
import type { Bookmark, HistoryEntry, DownloadItem } from '@/types/browser';

interface SidebarPanelsProps {
  activePanel: SidebarPanel;
  onClose: () => void;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  downloads: DownloadItem[];
  onNavigate: (url: string, title: string) => void;
  onRemoveBookmark: (id: string) => void;
  onClearHistory: () => void;
  onClearDownloads: () => void;
}

export default function SidebarPanels({ activePanel, onClose, bookmarks, history, downloads, onNavigate, onRemoveBookmark, onClearHistory, onClearDownloads }: SidebarPanelsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelRef.current) {
      gsap.to(panelRef.current, {
        x: activePanel !== 'none' ? 0 : -280,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  }, [activePanel]);

  if (activePanel === 'none') return null;

  return (
    <div
      ref={panelRef}
      className="absolute left-[60px] top-0 h-full w-[280px] bg-[#0a0a0c] border-r border-white/[0.06]
        flex flex-col z-20 translate-x-[-280px]"
    >
      {activePanel === 'bookmarks' && (
        <BookmarkPanel bookmarks={bookmarks} onNavigate={onNavigate} onRemoveBookmark={onRemoveBookmark} onClose={onClose} />
      )}
      {activePanel === 'history' && (
        <HistoryPanel history={history} onNavigate={onNavigate} onClearHistory={onClearHistory} onClose={onClose} />
      )}
      {activePanel === 'downloads' && (
        <DownloadPanel downloads={downloads} onClearDownloads={onClearDownloads} onClose={onClose} />
      )}
    </div>
  );
}
