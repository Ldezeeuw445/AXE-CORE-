import { useEffect, useMemo, useState } from 'react';
import { Cpu, Monitor, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader, StatPill } from '@/presentation/components/ui/AxeUI';
import { onlineDevices, type Device } from '@/infrastructure/gateways/computerRelay';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { voorkeurMachine, kiesVoorkeurMachine } from '@/infrastructure/persistence/voorkeurMachineService';
import { multiMonitorAvailable, openPersonalComputerUse } from '@/infrastructure/gateways/windowManagerService';

type ComputerTask = {
  id: string;
  title: string | null;
  status: string;
  target_device: string | null;
  created_at: string;
  updated_at?: string | null;
  payload?: Record<string, unknown> | null;
};

export default function ComputerUse() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [tasks, setTasks] = useState<ComputerTask[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function refresh() {
    const sb = getSupabase();
    const [live, pref] = await Promise.all([
      onlineDevices().catch(() => [] as Device[]),
      voorkeurMachine().catch(() => null),
    ]);
    setDevices(live);
    setPreferred(pref);

    if (sb) {
      const { data } = await sb
        .from('core_tasks')
        .select('id,title,status,target_device,created_at,updated_at,payload')
        .eq('capability', 'computer_use')
        .order('created_at', { ascending: false })
        .limit(30);
      setTasks((data ?? []) as ComputerTask[]);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    if (multiMonitorAvailable()) void openPersonalComputerUse().catch(console.error);
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const running = useMemo(
    () => tasks.filter(t => ['pending', 'claimed', 'running', 'in_progress'].includes(t.status)).length,
    [tasks],
  );

  async function choose(deviceId: string | null) {
    await kiesVoorkeurMachine(deviceId);
    setPreferred(deviceId);
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4 md:p-6">
      <PageHeader
        title="Personal Computer Use"
        subtitle="Live hands on your Macs — device-bound, audited and approval-gated"
        icon={Monitor}
        actions={
          <div className="flex items-center gap-2">
          {multiMonitorAvailable() && (
            <button type="button" onClick={() => void openPersonalComputerUse()} className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-400/[0.1]">
              Compact mode
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.07]"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <StatPill label="Online" value={String(devices.length)} />
        <StatPill label="Running" value={String(running)} />
        <StatPill label="Recent runs" value={String(tasks.length)} />
        <StatPill label="Guard" value="Approval gated" />
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        {devices.map(device => {
          const selected = preferred === device.id;
          return (
            <button
              key={device.id}
              type="button"
              onClick={() => void choose(selected ? null : device.id)}
              className={
                'group rounded-2xl border p-4 text-left transition ' +
                (selected
                  ? 'border-cyan-400/40 bg-cyan-400/[0.07]'
                  : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.03]')
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                    <Cpu size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{device.label}</div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-500">{device.id}</div>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                  ONLINE
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {device.workspaces.map(w => (
                  <span key={w} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-400">
                    {w}
                  </span>
                ))}
              </div>
              <div className="mt-4 text-[11px] text-zinc-500">
                {selected ? 'Preferred machine · click to clear preference' : 'Click to make this the preferred machine'}
              </div>
            </button>
          );
        })}
        {!loading && devices.length === 0 && (
          <div className="col-span-full rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5 text-sm text-amber-200">
            No computer worker has checked in during the last 45 seconds. AXE will fail closed instead of guessing.
          </div>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-black/30">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">Activity</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">Real computer_use tasks from the durable task kernel</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <ShieldCheck size={13} />
            read-only auto · writes require policy/approval
          </div>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {tasks.map(task => {
            const payload = task.payload ?? {};
            const tool = typeof payload.tool === 'string' ? payload.tool : task.title ?? 'computer task';
            const workspace = typeof payload.workspace === 'string' ? payload.workspace : '—';
            const tier = typeof payload.tier === 'string' ? payload.tier : '—';
            return (
              <div key={task.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1.4fr_.8fr_.7fr_.7fr] md:items-center">
                <div>
                  <div className="font-mono text-xs text-zinc-200">{tool}</div>
                  <div className="mt-1 text-[10px] text-zinc-500">{task.target_device ?? 'unassigned'}</div>
                </div>
                <div className="text-xs text-zinc-400">{workspace}</div>
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">{tier}</div>
                <div className="flex items-center justify-between gap-2 md:justify-end">
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-zinc-300">{task.status}</span>
                  <span className="text-[10px] text-zinc-600">{new Date(task.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            );
          })}
          {!loading && tasks.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">No computer-use runs yet.</div>
          )}
        </div>
      </section>

      <div className="mt-3 text-right text-[10px] text-zinc-600">
        {lastRefresh ? `Live refresh · ${lastRefresh.toLocaleTimeString()}` : 'Connecting…'}
      </div>
    </div>
  );
}
