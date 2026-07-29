import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import '@/app/index.css'
import App from '@/app/App.tsx'
import { AuthProvider } from '@/presentation/contexts/AuthContext.tsx'
import { isTauriRuntime } from '@/infrastructure/config/apiUrl'
import { restoreWindowLayout } from '@/infrastructure/gateways/windowManagerService'
import { installLiveChat } from '@/presentation/store/installLiveChat'
import { installWhisperVoice } from '@/presentation/store/installWhisperVoice'

// Live chat: allow send while thinking/speaking and drop superseded replies
installLiveChat();
// Voice conversation: Whisper STT + listen→reply→listen loop (until mic stop)
installWhisperVoice();

// Restore the last multi-monitor window layout (see NEXT_LEVEL_PLAN.md §7).
// Only the main window does this — every window loads this same bundle, so
// without the label check each restored window would itself try to restore
// the whole layout again.
if (isTauriRuntime()) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    if (getCurrentWindow().label === 'main') restoreWindowLayout().catch(() => {});
  });
}

// Register Service Worker for PWA (Vite PWA Workbox)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Vite PWA generates sw.js with workbox — auto handles caching
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[AXE CORE] SW registered:', registration.scope);

        // Auto-check for updates every 5 minutes
        setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);

        // Listen for new versions
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[AXE CORE] New version available!');
              // Show update prompt
              if (confirm('🚀 AXE CORE Update Available!\n\nA new version is ready. Reload to update?')) {
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.log('[AXE CORE] SW registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HashRouter>,
)
