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
import { CheckCircle2, XCircle } from 'lucide-react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { TERMINAL_TASK_STATUSES } from '@/domain/tasks/taskStatus';

interface TaakRij { id: string; title: string; status: string }
interface Melding { id: string; titel: string; mislukt: boolean }

const AFGEROND = new Set<string>(TERMINAL_TASK_STATUSES as readonly string[]);
const MISLUKT = new Set(['failed', 'cancelled', 'rejected']);

export function TaskCompletionToasts() {
  const [meldingen, setMeldingen] = useState<Melding[]>([]);
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
        const vorige = bekend.current.get(rij.id);
        const wasOpen = vorige !== undefined && !AFGEROND.has(vorige);
        const nuAf = AFGEROND.has(rij.status);
        if (wasOpen && nuAf) {
          const melding: Melding = { id: `${rij.id}:${rij.status}:${Date.now()}`, titel: rij.title, mislukt: MISLUKT.has(rij.status) };
          setMeldingen(prev => [melding, ...prev].slice(0, 4));
          const t = window.setTimeout(() => {
            setMeldingen(prev => prev.filter(m => m.id !== melding.id));
            timers.current.delete(melding.id);
          }, 6500);
          timers.current.set(melding.id, t);
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

  if (meldingen.length === 0) return null;

  return (
    <div
      className="fixed z-[108] flex flex-col gap-2 items-end pointer-events-none"
      style={{ top: 'calc(66px + env(safe-area-inset-top) + 12px)', right: 16, maxWidth: 320 }}
      aria-live="polite"
    >
      {meldingen.map(m => (
        <div
          key={m.id}
          className="flex items-start gap-2 rounded-lg px-3 py-2 pointer-events-auto"
          style={{
            background: 'rgba(12,12,15,0.96)',
            border: `1px solid ${m.mislukt ? 'rgba(239,68,68,0.35)' : 'rgba(52,211,153,0.35)'}`,
            boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
          }}
        >
          {m.mislukt
            ? <XCircle size={15} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
            : <CheckCircle2 size={15} style={{ color: '#34D399', flexShrink: 0, marginTop: 1 }} />}
          <div className="min-w-0">
            <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {m.mislukt ? 'Taak mislukt' : 'Taak klaar'}
            </p>
            <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{m.titel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
