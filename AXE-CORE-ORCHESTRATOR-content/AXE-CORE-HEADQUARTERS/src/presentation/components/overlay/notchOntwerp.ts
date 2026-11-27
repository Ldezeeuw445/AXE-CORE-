/**
 * Voorbeelddata voor de notch, alleen in ontwerpmodus (dev + `?ontwerp=1`).
 *
 * Zonder login en VPS toont de notch in een testbrowser alleen "geen
 * verbinding", en dan zijn de compacte standen niet te beoordelen. Met
 * `&notch=<stand>` krijgt hij hier vaste voorbeelden. In een gebouwde app is
 * `ontwerpModus()` hard false en valt dit hele pad weg (zie ontwerpModus.ts).
 *
 * Standen: werkt · fout · offline · rust · groet · gesleept.
 * `&groot=1` opent het grote paneel.
 */
import { ontwerpModus } from '@/infrastructure/supabase/ontwerpModus';
import type { DurableTaskApproval } from '@/infrastructure/gateways/axeCoreApiService';

export type OntwerpStand = 'werkt' | 'fout' | 'offline' | 'rust' | 'groet' | 'gesleept';

export interface NotchOntwerp {
  stand: OntwerpStand;
  groot: boolean;
  bereikbaar: boolean;
  taken: Array<{ id: string; title: string; status: string; assignee: string; capability?: string; error?: unknown; updated_at?: string }>;
  stappen: Array<{ id: string; volgorde: number; titel: string; status: string }>;
  approvals: DurableTaskApproval[];
}

const STANDEN: OntwerpStand[] = ['werkt', 'fout', 'offline', 'rust', 'groet', 'gesleept'];

export function notchOntwerp(): NotchOntwerp | null {
  // Eerst de letterlijke DEV-vlag: die maakt Vite in een build hard false, en
  // dan snoeit de minifier de voorbeelden hieronder uit de bundel.
  if (!import.meta.env.DEV) return null;
  if (!ontwerpModus()) return null;
  const q = new URLSearchParams(window.location.search);
  const ruw = q.get('notch') as OntwerpStand | null;
  if (!ruw || !STANDEN.includes(ruw)) return null;
  const nu = Date.now();
  const iso = (msTerug: number) => new Date(nu - msTerug).toISOString();
  const werk = [
    { id: 'o-1', title: 'Rebuild HQ notch screenshots', status: 'running', assignee: 'developer' },
    { id: 'o-2', title: 'Reply drafts for 3 NorthSea leads', status: 'running', assignee: 'northseamgr' },
    { id: 'o-3', title: 'Weekly project digest', status: 'queued', assignee: 'projectsmgr' },
    { id: 'o-4', title: 'Demo backtest EURUSD (paper)', status: 'waiting_approval', assignee: 'tradingos' },
  ];
  const ok = { id: 'oa-1', task_id: 'o-4', status: 'pending', kind: 'review', title: 'Review backtest notes' } as unknown as DurableTaskApproval;
  return {
    stand: ruw,
    groot: q.get('groot') === '1',
    bereikbaar: ruw !== 'offline',
    taken: ruw === 'werkt' ? werk
      : ruw === 'fout' ? [
        { id: 'o-9', title: 'Summarise NorthSea inbox', status: 'failed', assignee: 'northseamgr', capability: 'inbox.summary',
          error: { message: 'Gmail API timed out after 30 s' }, updated_at: iso(12 * 60_000) },
      ]
      : [],
    stappen: [
      { id: 's1', volgorde: 1, titel: 'Read the notch layout', status: 'done' },
      { id: 's2', volgorde: 2, titel: 'Render compact states', status: 'done' },
      { id: 's3', volgorde: 3, titel: 'Take screenshots', status: 'running' },
      { id: 's4', volgorde: 4, titel: 'Open the PR for review', status: 'pending' },
    ],
    approvals: ruw === 'werkt' ? [ok] : [],
  };
}
