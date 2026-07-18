import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'

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
