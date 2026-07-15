import { X, Bookmark as BookmarkIcon, Folder } from 'lucide-react';
import type { Bookmark } from '@/types/browser';

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  onNavigate: (url: string, title: string) => void;
  onRemoveBookmark: (id: string) => void;
  onClose: () => void;
}

export default function BookmarkPanel({ bookmarks, onNavigate, onRemoveBookmark, onClose }: BookmarkPanelProps) {
  return (
    <div className="h-full w-full bg-[#0a0a0c] border-r border-white/[0.06] flex flex-col z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <BookmarkIcon className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white capitalize">Bookmarks</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <X className="w-3.5 h-3.5 text-white/40" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        <div className="space-y-0.5">
          {Array.from(new Set(bookmarks.map((b) => b.folder))).map((folder) => (
            <div key={folder}>
              <div className="flex items-center gap-2 px-3 py-2 mt-2">
                <Folder className="w-3.5 h-3.5 text-white/30" />
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{folder}</span>
              </div>
              {bookmarks
                .filter((b) => b.folder === folder)
                .map((bm) => (
                  <div
                    key={bm.id}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg 
                      hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500/20 to-purple-500/20 
                      flex items-center justify-center flex-shrink-0">
                      <BookmarkIcon className="w-3 h-3 text-cyan-400/60" />
                    </div>
                    <div 
                      className="flex-1 min-w-0"
                      onClick={() => onNavigate(bm.url, bm.title)}
                    >
                      <p className="text-[12px] font-medium text-white/80 truncate">{bm.title}</p>
                      <p className="text-[10px] text-white/30 truncate">{new URL(bm.url).hostname}</p>
                    </div>
                    <button
                      onClick={() => onRemoveBookmark(bm.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-all"
                    >
                      <X className="w-3 h-3 text-white/40" />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
