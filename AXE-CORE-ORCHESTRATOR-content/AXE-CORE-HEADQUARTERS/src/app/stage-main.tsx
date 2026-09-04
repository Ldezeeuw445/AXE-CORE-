/**
 * Stage-entry — Home's stage zonder shell, zonder auth.
 *
 * Run: npm run dev:stage      → http://localhost:5010/stage.html
 *      npm run tauri:stage    → hetzelfde, in een echt Tauri-venster
 *
 * Wél een router, geen andere providers.
 *
 * De router leek eerst overbodig — er valt hier nergens heen te navigeren.
 * Maar NeuralMemorySystem en RuntimeCanvas roepen `useNavigate()` aan om een
 * knooppunt naar zijn pagina te kunnen openen, en die hook gooit buiten een
 * Router. Zonder router bleef Terrain dus zwart met "useNavigate() may be used
 * only in the context of a <Router> component" — precies het soort ding dat
 * alleen zichtbaar wordt door het echt te draaien.
 *
 * MemoryRouter en niet HashRouter: dit venster heeft geen adresbalk, en een
 * `#/` dat in een Tauri-titel opduikt is ruis. Navigeren doet hier niets, en
 * dat klopt — er is maar één scherm.
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import '@/app/index.css';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import HomeStage from '@/presentation/pages/HomeStage';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <MemoryRouter>
      <HomeStage />
    </MemoryRouter>
  </ErrorBoundary>,
);
