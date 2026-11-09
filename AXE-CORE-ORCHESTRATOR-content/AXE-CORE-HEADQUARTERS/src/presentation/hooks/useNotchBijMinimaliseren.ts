/**
 * Minimaliseer je AXE Core, dan komt de notch. Haal je hem terug, dan gaat hij.
 *
 * Luka, 5 november: "als ik hem open wil hebben moet ik hem gewoon zelf
 * openklikken in dat menu links onder in axe core, anders moet hij gewoon pas
 * komen als ik axe core minimaliseer, dat lijkt me het best."
 *
 * Dus twee wegen naar de notch en geen derde: de knop in het radiale dok
 * (`wisselZwevend('axe')`), en dit. Hij komt niet bij het opstarten op.
 *
 * ## Waarom pollen en geen gebeurtenis
 *
 * Tauri heeft geen "geminimaliseerd"-gebeurtenis. Er is `Resized`, maar die
 * komt ook bij elke sleep van de rand en zegt niets over de toestand, dus je
 * moet alsnog `isMinimized()` vragen. Eén vraag per 600 ms is goedkoop
 * (een IPC-aanroep die een bool teruggeeft) en het alternatief — een eigen
 * `on_window_event` in Rust — is een wijziging in de bouwketen die hier niet
 * te compileren valt. Dit werkt zonder dat risico.
 *
 * ## Waarom hij onthoudt wie hem opende
 *
 * Opende Luka de notch zelf met de knop, dan hoort hij niet te verdwijnen
 * zodra het hoofdvenster terugkomt — dat zou zijn eigen keuze overrulen.
 * Alleen een notch die hierdoor is opengegaan, gaat hierdoor ook weer dicht.
 */
import { useEffect } from 'react';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { openZwevend, sluitZwevend } from '@/infrastructure/gateways/zwevendeVensters';

/** Hoe vaak we vragen of het hoofdvenster nog in beeld is. */
const TIK_MS = 600;

export function useNotchBijMinimaliseren(): void {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let gestopt = false;
    let vorigGeminimaliseerd: boolean | null = null;
    // Alleen wat deze hook zelf opendeed, mag deze hook weer sluiten.
    let doorOnsGeopend = false;

    const tik = async () => {
      if (gestopt) return;
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const venster = getCurrentWindow();
        // Alleen het hoofdvenster beslist dit. Draait deze schil in een
        // zwevend venster, dan zou elk venster de notch aan- en uitzetten.
        if (venster.label !== 'main') {
          gestopt = true;
          return;
        }
        const nu = await venster.isMinimized();
        if (gestopt || nu === vorigGeminimaliseerd) {
          vorigGeminimaliseerd = nu;
          return;
        }
        const eerste = vorigGeminimaliseerd === null;
        vorigGeminimaliseerd = nu;
        // De eerste ronde stelt alleen de beginstand vast. Zonder dit zou een
        // app die al niet-geminimaliseerd start meteen "teruggehaald" heten en
        // een notch sluiten die Luka net zelf had opengeklikt.
        if (eerste) return;

        if (nu) {
          await openZwevend('axe');
          doorOnsGeopend = true;
        } else if (doorOnsGeopend) {
          await sluitZwevend('axe');
          doorOnsGeopend = false;
        }
      } catch {
        /* geen Tauri-venster, of het venster is weg: laat de stand staan */
      }
    };

    void tik();
    const id = window.setInterval(() => { void tik(); }, TIK_MS);
    return () => { gestopt = true; window.clearInterval(id); };
  }, []);
}
