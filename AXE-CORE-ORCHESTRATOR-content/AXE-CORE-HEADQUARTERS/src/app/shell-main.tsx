/**
 * Shell-entry — de héle schil, zonder auth.
 *
 * Run: npm run dev:shell   → http://localhost:5011/shell.html
 *
 * ## Waarom dit naast stage-main bestaat
 *
 * De stage toont Home's toneel: de sphere en de scenes, zonder schil. Precies
 * goed om aan de plaat en de scenes te werken, en precies verkeerd om aan de
 * composers, de band onderin of de navigatie te werken -- want die zitten
 * allemaal ín de schil.
 *
 * En de echte app kan daar niet voor gebruikt worden: die staat achter
 * `RequireAuth`, en aan een ontwerp werken zou dan betekenen dat er een
 * wachtwoord getypt wordt in een venster dat iemand anders aanstuurt. Dat is
 * geen goede ruil voor het kunnen zien van een kleur.
 *
 * ## Wat hier NIET gebeurt
 *
 * De auth-poort wordt niet omzeild, uitgezet of nagebootst. Dit bestand rendert
 * simpelweg de schil rechtstreeks, net zoals stage-main HomeStage rechtstreeks
 * rendert. `RequireAuth`, `AuthProvider` en de echte routetabel worden hier
 * niet geïmporteerd, dus er is niets om te omzeilen -- en deze entry zit in
 * geen enkele productiebuild.
 *
 * MemoryRouter, om dezelfde reden als de stage: dit venster heeft geen
 * adresbalk nodig en een `#/` in de titel is ruis.
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router';
import '@/app/index.css';
import { applyStoredLookEarly } from '@/presentation/hooks/useLook';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import { NotificationProvider } from '@/presentation/contexts/NotificationContext';
import { AppShell } from '@/presentation/components/layout/AppShell';
import Home from '@/presentation/pages/Home';
import CodeEditorPage from '@/presentation/pages/CodeEditorPage';
import SettingsPage from '@/presentation/pages/SettingsPage';
import Memory from '@/presentation/pages/Memory';

// Zet de plaatstand vóór het eerste frame, net als de echte app. Zonder dit
// zie je een flits van de standaardstand en dan de jouwe -- wat er precies
// uitziet als een fout, en bij ontwerpwerk juist het ding is waar je naar kijkt.
applyStoredLookEarly();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <NotificationProvider>
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="code-editor" element={<CodeEditorPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="memory/explore" element={<Memory />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </NotificationProvider>
  </ErrorBoundary>,
);
