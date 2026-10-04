/**
 * Een pagina openen: in een eigen venster als dat kan, anders gewoon hierheen.
 *
 * ## Waarom dit bestaat
 *
 * Gemeten 4 okt 2026. `openPageOnMonitor` gooit buiten Tauri -- terecht, want
 * een webpagina kan geen tweede OS-venster op een gekozen monitor zetten. Maar
 * vier knoppen riepen hem aan met `void` ervoor:
 *
 *   * het dok: Code Studio window, NorthSea shell, Browser shell
 *   * de Trading-hoekknop in AppShell
 *
 * `void` op een promise die rejected geeft een stille unhandled rejection. Op
 * de iPad-PWA -- waar dat dok WEL staat, want `mobileCommandSurface` is alleen
 * de telefoon -- gebeurde er dus niets. Geen venster, geen melding, geen fout
 * in beeld. Een knop die niets doet is erger dan een knop die er niet is: je
 * blijft denken dat je iets verkeerd doet.
 *
 * Wat een gebruiker wil als een tweede venster niet kan, is die pagina zien.
 * Dus: op de Mac een eigen venster, daarbuiten gewoon ernaartoe navigeren.
 * Dezelfde knop, hetzelfde doel, per oppervlak de weg die er is.
 *
 * De afbeelding pagina -> route komt uit `routeVanPagina` in domain, dezelfde
 * die `openPageOnMonitor` voor zijn URL gebruikt.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { routeVanPagina } from '@/domain/navRegistry';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { openPageOnMonitor } from '@/infrastructure/gateways/windowManagerService';

export function useOpenPagina(): (pagina: string, monitor?: number) => void {
  const navigate = useNavigate();
  return useCallback((pagina: string, monitor = 0) => {
    if (!isTauriRuntime()) {
      navigate(routeVanPagina(pagina));
      return;
    }
    // Lukt het venster niet (monitor weg, pagina onbekend), dan nog steeds de
    // pagina tonen in plaats van stil te vallen. De fout blijft in de console
    // staan, want dat is een echte storing en geen normale stand.
    void openPageOnMonitor(pagina, monitor).catch((err: unknown) => {
      console.error('[useOpenPagina] eigen venster mislukt, ga er hier heen:', pagina, err);
      navigate(routeVanPagina(pagina));
    });
  }, [navigate]);
}
