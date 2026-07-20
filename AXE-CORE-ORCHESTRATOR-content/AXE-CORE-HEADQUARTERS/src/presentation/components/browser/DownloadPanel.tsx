import { X, Download, FileText, Trash2, Pause, RotateCcw } from 'lucide-react';
import type { DownloadItem } from '@/domain/types/browser';

interface DownloadPanelProps {
  downloads: DownloadItem[];
  onClearDownloads: () => void;
  onClose: () => void;
}

export default function DownloadPanel({ downloads, onClearDownloads, onClose }: DownloadPanelProps) {
  return (
    <div className="h-full w-full bg-[#0a0a0c] border-r border-white/[0.06] flex flex-col z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white capitalize">Downloads</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onClearDownloads} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Clear completed">
            <Trash2 className="w-3.5 h-3.5 text-white/40" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5 text-white/40" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
        {downloads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-white/30">
            <Download className="w-8 h-8 mb-2" />
            <p className="text-xs">No downloads</p>
          </div>
        )}
        {downloads.map((dl) => (
          <div
            key={dl.id}
            className="px-3 py-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
          >
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-cyan-400/60 flex-shrink-0" />
              <p className="text-[12px] font-medium text-white/80 truncate flex-1">{dl.filename}</p>
              <span className={`text-[10px] flex-shrink-0 ${
                dl.status === 'completed' ? 'text-green-400' :
                dl.status === 'failed' ? 'text-red-400' :
                dl.status === 'paused' ? 'text-yellow-400' :
                'text-cyan-400'
              }`}>
                {dl.status === 'completed' ? 'Done' :
                 dl.status === 'failed' ? 'Failed' :
                 dl.status === 'paused' ? 'Paused' :
                 `${dl.progress}%`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    dl.status === 'completed' ? 'bg-green-400' :
                    dl.status === 'failed' ? 'bg-red-400' :
                    'bg-cyan-400'
                  }`}
                  style={{ width: `${dl.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30 flex-shrink-0">{dl.size}</span>
            </div>
            {dl.status === 'downloading' && (
              <div className="flex items-center gap-1 mt-2">
                <button className="p-1 rounded hover:bg-white/10 transition-colors">
                  <Pause className="w-3 h-3 text-white/40" />
                </button>
                <button className="p-1 rounded hover:bg-white/10 transition-colors">
                  <RotateCcw className="w-3 h-3 text-white/40" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
