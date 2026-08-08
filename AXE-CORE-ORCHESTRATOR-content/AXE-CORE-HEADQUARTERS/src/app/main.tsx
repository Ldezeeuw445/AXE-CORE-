import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { Toaster } from 'sonner'
import '@/app/index.css'
import App from '@/app/App.tsx'
import { AuthProvider } from '@/presentation/contexts/AuthContext.tsx'
import { installLiveChat } from '@/presentation/store/installLiveChat'
import { installWhisperVoice } from '@/presentation/store/installWhisperVoice'
import { installFishVoice } from '@/presentation/store/installFishVoice'
import { installStableChat } from '@/presentation/store/installStableChat'
import { installSecureChatBoost } from '@/presentation/store/installSecureChatBoost'
import { installSpherePresent } from '@/presentation/store/installSpherePresent'
import { installSphereXR } from '@/presentation/components/axe-core/sphere/SphereXR'
import { installContinuousMemory } from '@/infrastructure/persistence/continuousMemoryService'

// Live chat: allow send while thinking/speaking and drop superseded replies
installLiveChat();
// Voice conversation: Whisper STT + listen→reply→listen loop (until mic stop)
installWhisperVoice();
// Fish Audio: default identity voice id + TTS provider
installFishVoice();
// Stable identity: short Gemini cascade for simple chat + Fish TTS on replies
installStableChat();
installSecureChatBoost();
// Living Display: project map/chart on sphere from chat intent + OPEN_WINDOW
installSpherePresent();
// WebXR / Maps3D entry from sphere map projection
installSphereXR();
// Continuous memory: every session + chat turns land in the right stores
installContinuousMemory();

// Register Service Worker for PWA (Vite PWA Workbox)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[AXE CORE] SW registered:', registration.scope);

        setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[AXE CORE] New version available!');
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
  <>
    <Toaster
      position="top-right"
      theme="dark"
      richColors
      closeButton
      toastOptions={{ duration: 5000 }}
    />
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </>,
)
