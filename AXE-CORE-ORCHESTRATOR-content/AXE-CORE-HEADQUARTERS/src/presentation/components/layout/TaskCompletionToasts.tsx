/**
 * "Er is net iets klaar" -- zichtbaar in de app zelf, niet alleen elders.
 *
 * ## Wat er al bestond, en waarom dat niet genoeg is
 *
 * `RightPanel.tsx`'s "ACTIVE TASKS" (en "MISSION TIMELINE") laten al zien
 * WAT er loopt en WAT er klaar is -- maar dat is een lijst die je moet gaan
 * opzoeken (het paneel moet open staan, en sinds de driedeling in
 * `RightPanel.tsx` ook nog op het juiste tabblad). Geen van beide is een
 * MOMENT: een taak die van `in_progress` naar `completed` springt terwijl je
 * ergens anders op het scherm zit, verandert een regel in een lijst die
 * niemand op dat moment leest. Dat is precies "AXE deed iets, en ik hoorde
 * het pas van iets buiten de app" -- de klacht die dit stuk oplost.
 *
 * Dus geen tweede, parallelle taken-opslag: dezelfde `core_tasks`-tabel als
 * `RightPanel.tsx`'s `ActiveTasksWidget`, gepolld om dezelfde reden (zie de
 * uitleg daar: `core_tasks` zit niet in de `supabase_realtime`-publicatie,
 * dus realtime kan hier niet). Dit voegt alleen de MELDING toe die nergens
 * bestond: een taak die tussen twee polls van open naar afgerond springt,
 * krijgt een kort, zelf-verdwijnend bericht, ongeacht welk paneel open staat
 * of welk tabblad daarin actief is.
 *
 * Eerste keer laden telt niet als "zojuist voltooid" -- anders meldt de app
 * bij elke herstart in één klap alles wat ooit al klaar was.
 */
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { taakMeldingVan } from '@/domain/taken/taakMelding';
import { useUIStore } from '@/presentation/store/uiStore';

interface TaakRij { id: string; title: string; status: string }
interface Melding { id: string; titel: string; mislukt: boolean }

export function TaskCompletionToasts() {
  const [, setMeldingen] = useState<Melding[]>([]);
  const bekend = useRef<Map<string, string> | null>(null);
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let levend = true;

    const controleer = async () => {
      const { data } = await sb
        .from('core_tasks')
        .select('id,title,status')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (!levend || !data) return;
      const rijen = data as TaakRij[];

      if (!bekend.current) {
        // Eerste meting: alleen onthouden, niets melden -- zie uitleg bovenin.
        bekend.current = new Map(rijen.map(r => [r.id, r.status]));
        return;
      }

      for (const rij of rijen) {
        const vorigeStand = bekend.current.get(rij.id);
        const m = taakMeldingVan(
          rij,
          vorigeStand !== undefined ? { id: rij.id, title: rij.title, status: vorigeStand } : null,
        );
        if (m && !m.stuurde) {
          const melding: Melding = { id: `${rij.id}:${rij.status}:${Date.now()}`, titel: m.titel, mislukt: m.mislukt };
          useUIStore.getState().bumpPhoneTaakBadge();
          setMeldingen(prev => [melding, ...prev].slice(0, 4));
          const t = window.setTimeout(() => {
            setMeldingen(prev => prev.filter(x => x.id !== melding.id));
            timers.current.delete(melding.id);
          }, 6500);
          timers.current.set(melding.id, t);
          void sb.from('core_notifications').insert({
            type: m.mislukt ? 'warning' : 'success',
            message: `${m.tekst}: ${rij.title}`,
          });
        }
        bekend.current.set(rij.id, rij.status);
      }
    };

    void controleer();
    const iv = window.setInterval(() => void controleer(), 20_000);
    const timerMap = timers.current;
    return () => {
      levend = false;
      window.clearInterval(iv);
      for (const t of timerMap.values()) window.clearTimeout(t);
    };
  }, []);

  // Desktop: dezelfde meldingen zitten in de taken-pill boven de composer.
  // Telefoon: bel-badge, nooit een toast over de inhoud (A17, okt 2026).
  return null;
}
