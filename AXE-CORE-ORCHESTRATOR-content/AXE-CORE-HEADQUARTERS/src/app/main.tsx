import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { Toaster } from 'sonner'
import '@/app/index.css'
import { applyStoredLookEarly } from '@/presentation/hooks/useLook'
import { isAndroidShellRuntime, isTauriRuntime, WEB_AXE_PROXY } from '@/infrastructure/config/apiUrl'
import { getSupabase } from '@/infrastructure/supabase/supabaseClient'
import { installeerWebProxyAuth } from '@/infrastructure/supabase/webProxyAuth'
import { haalServerProviders } from '@/infrastructure/config/serverProviders'

// Vóór de eerste render: anders ziet frame 1 de standaardstand en klapt het
// scherm daarna om -- een flits die eruitziet als een fout.
applyStoredLookEarly()

// Web-app: de AXE API loopt via Supabase (axe-core-proxy), en die laat alleen
// Luka's eigen login door. Hier gaat de sessie op elk verzoek daarheen, vóór er
// één vertrekt. De verpakte apps praten rechtstreeks met de VPS.
if (import.meta.env.PROD && !isTauriRuntime() && !isAndroidShellRuntime()) {
  installeerWebProxyAuth(
    WEB_AXE_PROXY,
    async () => (await getSupabase()?.auth.getSession())?.data.session?.access_token ?? null,
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  )
  // Pas na het inloggen komt de proxy erdoor; dan meteen de lijst verversen.
  getSupabase()?.auth.onAuthStateChange((gebeurtenis) => {
    if (gebeurtenis === 'SIGNED_IN' || gebeurtenis === 'INITIAL_SESSION') void haalServerProviders()
  })
}

// Welke providers de VPS zelf bedient: de chat heeft die lijst nodig, en tot
// 28 sep vulde alleen het instellingenscherm hem (zie serverProviders.ts).
void haalServerProviders()

// In de Tauri-app staan de macOS-verkeerslichten linksboven over de
// inhoud (titleBarStyle Overlay). Deze klasse laat de CSS daar ruimte
// voor maken -- in de browser en op het domein bestaat die balk niet.
try {
  const w = window as unknown as Record<string, unknown>
  if (w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined) {
    document.documentElement.classList.add("axe-tauri")
  }
} catch { /* geen window */ }

// "ResizeObserver loop completed with undelivered notifications" is een bekende,
// onschuldige browser-waarschuwing (o.a. van xterm/kaartcomponenten die tijdens
// een resize opnieuw meten). In de Tauri-debug-webview komt zo'n onafgevangen
// error als rode banner over de app. Deze ene slikken we, de rest laten we staan.
try {
  window.addEventListener('error', (e) => {
    if (e?.message && /ResizeObserver loop/i.test(e.message)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  });
} catch { /* geen window */ }

import App from '@/app/App.tsx'
import { AuthProvider } from '@/presentation/contexts/AuthContext.tsx'
import { installLiveChat } from '@/presentation/store/installLiveChat'
import { installOpenAIRealtimeVoice } from '@/presentation/store/installOpenAIRealtimeVoice'
import { installFishVoice } from '@/presentation/store/installFishVoice'
import { installStableChat } from '@/presentation/store/installStableChat'
import { installTierRouter } from '@/presentation/store/installTierRouter'
import { installGesprekSync } from '@/presentation/store/installGesprekSync'
import { installSpherePresent } from '@/presentation/store/installSpherePresent'
import { installCoreStatus } from '@/presentation/store/installCoreStatus'
import { installSphereXR } from '@/presentation/components/axe-core/sphere/SphereXR'
import { installContinuousMemory } from '@/infrastructure/persistence/continuousMemoryService'
import { installMemoryFlushHooks } from '@/infrastructure/persistence/memoryRecorder'

// Live chat: allow send while thinking/speaking and drop superseded replies
installLiveChat();
// Wis de dode TTS-picker (Fish/ElevenLabs) zodat geen statusrij hem terugleest
installFishVoice();
// Stable identity: korte cascade voor simpele chat; stem blijft George
installStableChat();
// Jarvis-route: tier 1/2/3 vóór de grote cascade. Ná stable, vóór de
// send-guard: typed send hangt Whisper nog steeds op, en fallback valt
// terug op het pad dat hierboven al staat.
installTierRouter();
installGesprekSync();
// Eén poller op /status/axe-core. Vier schermen vroegen het los van elkaar,
// elk met een eigen interval -- en dus met antwoorden die tot een minuut uit
// de pas liepen. Nu vraagt deze het, en leest de rest de store.
installCoreStatus();
// Living Display: project map/chart on sphere from chat intent + OPEN_WINDOW
installSpherePresent();
// Voice has ONE path on every surface: OpenAI Realtime speech-to-speech.
// No Whisper/STT/TTS conversation fallback: if Realtime is unavailable AXE
// shows the real error instead of silently degrading to a slower experience.
installOpenAIRealtimeVoice();
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

/**
 * Draaien we in de Tauri-app?
 *
 * Geen worker daar, en een die er al staat gaat eruit. De bestanden staan al
 * lokaal in de .app, dus er is niets om voor in te springen -- en wat de cache
 * wél deed was bij de start de OUDE index.html teruggeven, die naar de oude
 * asset-namen wijst. Dan bouw je opnieuw, staat de nieuwe bundel op schijf, en
 * zie je de oude app. Zie de uitleg bij isTauriBuild in vite.config.ts.
 *
 * __TAURI_INTERNALS__ en niet __TAURI__: die tweede bestaat alleen met
 * withGlobalTauri aan, en dat staat hier niet aan.
 */
const inTauri =
  typeof window !== 'undefined' &&
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== undefined;

// Never register SW during Vite dev — sw.js is not served and breaks Safari/Chrome reload
const isDev = import.meta.env.DEV;

/**
 * De worker die er nog staat opruimen.
 *
 * Het vangnet naast selfDestroying, voor het geval een oude registratie blijft
 * hangen. Eén keer herladen en niet in een lus: de vlag staat in
 * sessionStorage, dus hij geldt voor dit ene vensterleven. Zonder die grens
 * herlaadt een app die om een andere reden een controller houdt zichzelf
 * eindeloos, en dat is erger dan een oude cache.
 */
const HERLAAD_VLAG = 'axe-sw-opgeruimd';

if (inTauri && 'serviceWorker' in navigator) {
  void (async () => {
    try {
      const registraties = await navigator.serviceWorker.getRegistrations();
      if (registraties.length === 0) return;
      await Promise.all(registraties.map((r) => r.unregister()));
      if (typeof caches !== 'undefined') {
        const namen = await caches.keys();
        await Promise.all(namen.map((n) => caches.delete(n)));
      }
      const alGedaan = sessionStorage.getItem(HERLAAD_VLAG) === '1';
      // Alleen herladen als hij ONS ook echt bediende: anders is er niets
      // stils aan de hand en is een herlading pure schrik.
      if (!alGedaan && navigator.serviceWorker.controller) {
        sessionStorage.setItem(HERLAAD_VLAG, '1');
        window.location.reload();
      }
    } catch {
      // Geen opruiming mogelijk is geen reden om de app niet te starten.
    }
  })();
}

/**
 * De nieuwe versie ook echt laten overnemen.
 *
 * Hier stond een tweede `navigator.serviceWorker.register('/sw.js')` -- de
 * plugin zet er zelf al een in `index.html` -- plus een prompt die de update
 * die hij aanbood niet kón toepassen: hij herlaadde wel, maar stuurde nooit
 * `SKIP_WAITING`, dus de nieuwe worker bleef wachten en de oude bleef je
 * bedienen. Met `skipWaiting`/`clientsClaim` in vite.config neemt de nieuwe
 * worker vanaf nu zelf over; dit stukje zorgt alleen nog dat het VENSTER
 * meegaat, zodat je niet met een halve oude pagina achterblijft.
 *
 * `controllerchange` vuurt zodra de nieuwe worker de controle heeft. Eén keer
 * herladen, en de bewaking erop dat dat niet in een lus belandt.
 */
if ('serviceWorker' in navigator && !inAndroidShell && !inTauri && !isDev) {
  let herladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (herladen) return;
    herladen = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    void navigator.serviceWorker.ready.then((registration) => {
      // Elke vijf minuten kijken of er een nieuwe build staat. Zonder dit
      // merkt een PWA die dagenlang open blijft staan nooit iets.
      setInterval(() => { void registration.update(); }, 5 * 60 * 1000);
    }).catch((error) => {
      console.warn('[AXE CORE] service worker niet gereed:', error);
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
