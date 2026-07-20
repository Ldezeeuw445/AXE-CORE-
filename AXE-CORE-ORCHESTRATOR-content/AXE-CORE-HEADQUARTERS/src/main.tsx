import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './app/App.tsx'
import { registerServiceWorker } from './app/registerServiceWorker.ts'
import { AuthProvider } from './contexts/AuthContext.tsx'

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HashRouter>,
)
