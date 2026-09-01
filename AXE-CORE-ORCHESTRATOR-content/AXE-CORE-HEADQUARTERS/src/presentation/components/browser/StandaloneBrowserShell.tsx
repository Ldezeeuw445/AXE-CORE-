import { ReactNode } from 'react';
import { ExternalLink, Plus, Settings, User } from 'lucide-react';
import { multiMonitorAvailable, openStandaloneBrowser } from '@/infrastructure/gateways/windowManagerService';

interface StandaloneBrowserShellProps {
  children: ReactNode;
  onOpenInApp?: () => void;
}

/** Arc-style glassmorphism shell for the standalone desktop browser window. */
export function StandaloneBrowserShell({ children, onOpenInApp }: StandaloneBrowserShellProps) {
  const shortcuts = [
    { label: 'GitHub', url: 'https://github.com', color: '#fff' },
    { label: 'Google', url: 'https://google.com', color: '#4285F4' },
    { label: 'YouTube', url: 'https://youtube.com', color: '#FF0000' },
    { label: 'Reddit', url: 'https://reddit.com', color: '#FF4500' },
    { label: 'ChatGPT', url: 'https://chatgpt.com', color: '#10A37F' },
    { label: 'DeepSeek', url: 'https://chat.deepseek.com', color: '#4D6BFE' },
  ];

  return (
    <div
      className="h-[100dvh] w-full flex overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a0a12 0%, #1a1020 40%, #0d1520 100%)',
      }}
    >
      {/* Arc-style glass sidebar */}
      <aside
        className="w-[72px] flex-shrink-0 flex flex-col items-center py-3 gap-2 border-r border-white/[0.06]"
        style={{
          background: 'rgba(12, 12, 18, 0.75)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        }}
      >
        {/* Window dots */}
        <div className="flex gap-1.5 mb-2 px-2 self-start">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>

        {/* Shortcut grid */}
        <div className="grid grid-cols-2 gap-1.5 px-1.5">
          {shortcuts.map((s) => (
            <a
              key={s.label}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.label}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold transition-all hover:scale-110 cursor-pointer"
              style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30` }}
            >
              {s.label[0]}
            </a>
          ))}
        </div>

        <div className="flex-1" />

        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
          title="New tab"
        >
          <Plus className="w-4 h-4 text-white/50" />
        </button>

        {onOpenInApp && (
          <button
            onClick={onOpenInApp}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
            title="Open in AXE CORE app"
          >
            <ExternalLink className="w-4 h-4 text-white/50" />
          </button>
        )}

        <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer" title="Settings">
          <Settings className="w-4 h-4 text-white/50" />
        </button>

        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400/30 to-purple-500/20 flex items-center justify-center">
          <User className="w-4 h-4 text-white/60" />
        </div>
      </aside>

      {/* Main glass content pane */}
      <main
        className="flex-1 m-2 ml-0 rounded-2xl overflow-hidden border border-white/[0.08]"
        style={{
          background: 'rgba(8, 8, 14, 0.65)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {children}
      </main>
    </div>
  );
}

/** Button to pop browser out to standalone desktop window (Tauri only). */
export function OpenStandaloneBrowserButton({ className }: { className?: string }) {
  if (!multiMonitorAvailable()) return null;

  return (
    <button
      onClick={() => openStandaloneBrowser().catch(console.error)}
      className={`p-1.5 rounded-lg hover:bg-white/10 text-white/60 transition-colors cursor-pointer ${className ?? ''}`}
      title="Open browser in separate window"
    >
      <ExternalLink className="w-4 h-4" />
    </button>
  );
}
