import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { Toaster } from 'sonner'
import '@/app/index.css'
import { applyStoredLookEarly } from '@/presentation/hooks/useLook'

// Vóór de eerste render: anders ziet frame 1 de standaardstand en klapt het
// scherm daarna om -- een flits die eruitziet als een fout.
applyStoredLookEarly()

// In de Tauri-app staan de macOS-verkeerslichten linksboven over de
// inhoud (titleBarStyle Overlay). Deze klasse laat de CSS daar ruimte
// voor maken -- in de browser en op het domein bestaat die balk niet.
try {
  const w = window as unknown as Record<string, unknown>
  if (w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined) {
    document.documentElement.classList.add("axe-tauri")
  }
} catch { /* geen window */ }
import App from '@/app/App.tsx'
import { AuthProvider } from '@/presentation/contexts/AuthContext.tsx'
import { installLiveChat } from '@/presentation/store/installLiveChat'
import { installWhisperVoice } from '@/presentation/store/installWhisperVoice'
import { installFishVoice } from '@/presentation/store/installFishVoice'
import { installStableChat } from '@/presentation/store/installStableChat'
import { installSpherePresent } from '@/presentation/store/installSpherePresent'
import { installSphereXR } from '@/presentation/components/axe-core/sphere/SphereXR'
import { installContinuousMemory } from '@/infrastructure/persistence/continuousMemoryService'
import { installMemoryFlushHooks } from '@/infrastructure/persistence/memoryRecorder'

// Live chat: allow send while thinking/speaking and drop superseded replies
installLiveChat();
// Voice conversation: Whisper STT + listen→reply→listen loop (until mic stop)
installWhisperVoice();
// Fish Audio: default identity voice id + TTS provider
installFishVoice();
// Stable identity: short Gemini cascade for simple chat + Fish TTS on replies
installStableChat();
// Living Display: project map/chart on sphere from chat intent + OPEN_WINDOW
installSpherePresent();
// WebXR / Maps3D entry from sphere map projection
installSphereXR();
// Continuous memory: every session + chat turns land in the right stores
installContinuousMemory();
// Memory batches on a 2s window, so a tab closed mid-window would drop the
// last few events of the session — the ones describing what Luka just did.
installMemoryFlushHooks();

// Register Service Worker for PWA (Vite PWA Workbox).
//
// Skipped inside the AXE Core Android shell: that build ships no sw.js (see
// ANDROID_SHELL in vite.config.ts), registration on the appassets origin fails,
// and the rejection surfaces as a red error banner over the app. Caching is the
// shell's job there — it serves this bundle from inside the APK already.
const inAndroidShell =
  typeof window !== 'undefined' &&
  (window as unknown as Record<string, unknown>).__AXE_ANDROID__ !== undefined;

// Never register SW during Vite dev — sw.js is not served and breaks Safari/Chrome reload
const isDev = import.meta.env.DEV;

if ('serviceWorker' in navigator && !inAndroidShell && !isDev) {
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
