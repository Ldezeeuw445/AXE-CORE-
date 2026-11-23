/**
 * De kerncijfers van de Cron-tab (restyle 23 nov): in één blik hoeveel er
 * draait, wat stil staat, wat de laatste keer faalde en wat als eerste komt.
 * Puur -- eigen type, zodat het domein niets uit infrastructure haalt.
 */
export interface CronRij {
  id: string;
  name: string;
  enabled: boolean;
  next_run_at: string | null;
  last_status: string | null;
  consecutive_failures?: number;
}

export interface CronStand {
  actief: number;
  gepauzeerd: number;
  fout: CronRij[];
  volgende: CronRij | null;
}

const FOUT = new Set(['fail', 'timeout']);

export function cronStand(rijen: CronRij[], nu = Date.now()): CronStand {
  const aan = rijen.filter((r) => r.enabled);
  const fout = aan
    .filter((r) => FOUT.has(String(r.last_status)))
    .sort((a, b) => (b.consecutive_failures ?? 0) - (a.consecutive_failures ?? 0));
  const volgende = aan
    .filter((r) => r.next_run_at && Date.parse(r.next_run_at) >= nu - 60_000)
    .sort((a, b) => Date.parse(a.next_run_at!) - Date.parse(b.next_run_at!))[0] ?? null;
  return { actief: aan.length, gepauzeerd: rijen.length - aan.length, fout, volgende };
}

/** "in 4 min", "in 2 h", "now". */
export function overHoeLang(iso: string | null, nu = Date.now()): string {
  if (!iso) return '—';
  const min = Math.round((Date.parse(iso) - nu) / 60_000);
  if (min <= 0) return 'now';
  if (min < 60) return `in ${min} min`;
  const uur = Math.round(min / 60);
  return uur < 48 ? `in ${uur} h` : `in ${Math.round(uur / 24)} d`;
}
