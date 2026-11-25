import { useEffect, useMemo, useState } from 'react';
import { Cpu, RefreshCw, ShieldCheck } from 'lucide-react';
import { DashSchil, DashKop, DashRaster, DashKaart, DashLeeg } from '@/presentation/components/layout/dashboardSchil';
import { onlineDevices, type Device } from '@/infrastructure/gateways/computerRelay';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { voorkeurMachine, kiesVoorkeurMachine } from '@/infrastructure/persistence/voorkeurMachineService';
import { multiMonitorAvailable, openPersonalComputerUse } from '@/infrastructure/gateways/windowManagerService';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { SchuifBalk } from '@/presentation/components/layout/tabMaatstaf';

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
    // The page is the management/overview surface. The floating Computer Use
    // window is opened explicitly from the radial dock or "Compact mode".
    // Auto-opening it here made one navigation produce two Computer Use UIs.
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
    <div className="axe-computer-use-v3 flex min-h-0 flex-1 flex-col" data-axe-computer-use="v3">
    <TabRail kant="links">
      <SchuifBalk
        groepen={[
          {
            titel: `Machine · ${devices.length} online`,
            items: [
              { id: 'auto', label: 'Automatic', actief: preferred === null, onKies: () => void choose(null) },
              ...devices.map((d) => ({
                id: d.id,
                label: d.label,
                icoon: <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--success)' }} />,
                actief: preferred === d.id,
                onKies: () => void choose(d.id),
              })),
            ],
          },
          {
            titel: 'Actions',
            items: [
              { id: 'refresh', label: 'Refresh', icoon: <RefreshCw size={13} />, onKies: () => void refresh() },
              ...(multiMonitorAvailable()
                ? [{ id: 'compact', label: 'Compact mode', icoon: <Cpu size={13} />, onKies: () => void openPersonalComputerUse() }]
                : []),
            ],
          },
        ]}
      />
    </TabRail>
    {/* 25 nov (Luka: geen scroll): kop met cijfers, machines links, activiteit
        rechts; alleen de lijsten schuiven in hun kaart. */}
    <DashSchil
      tab="computer-use"
      kop={
        <DashKop
          titel="Computer use"
          sub="Live hands on your Macs · device-bound, audited, approval-gated"
          cijfers={[
            { label: 'Online', waarde: devices.length, sub: 'machines', toon: devices.length ? 'ok' : undefined },
            { label: 'Running', waarde: running, sub: 'tasks now' },
            { label: 'Recent', waarde: tasks.length, sub: 'runs' },
            { label: 'Guard', waarde: 'On', sub: 'approval gated', toon: 'ok' },
          ]}
          acties={
            <div className="flex items-center gap-2">
              {multiMonitorAvailable() && (
                <button type="button" onClick={() => void openPersonalComputerUse()} className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-400/[0.1]">
                  Compact mode
                </button>
              )}
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.07]"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          }
        />
      }
    >
      <DashRaster kolommen={3} rijen={1}>
        <DashKaart titel="Machines" telling={devices.length}>
          <div className="flex flex-col gap-2">
            {devices.map(device => {
              const selected = preferred === device.id;
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => void choose(selected ? null : device.id)}
                  className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.04]"
                  style={{ outline: selected ? '1px solid var(--tint-line)' : undefined, outlineOffset: -1 }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2"><Cpu size={16} /></div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-100">{device.label}</div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{device.id}</div>
                      </div>
                    </div>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">ONLINE</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {device.workspaces.map(w => (
                      <span key={w} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400">{w}</span>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    {selected ? 'Preferred machine · click to clear' : 'Click to make this the preferred machine'}
                  </div>
                </button>
              );
            })}
            {!loading && devices.length === 0 && (
              <DashLeeg>No computer worker has checked in during the last 45 seconds. AXE fails closed instead of guessing.</DashLeeg>
            )}
          </div>
        </DashKaart>

        <DashKaart
          kolom={2}
          titel="Activity"
          telling={tasks.length || undefined}
          actie={
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <ShieldCheck size={13} />
              {lastRefresh ? `live · ${lastRefresh.toLocaleTimeString('en-GB')}` : 'connecting…'}
            </span>
          }
        >
          <div className="divide-y divide-white/[0.06]">
            {tasks.map(task => {
              const payload = task.payload ?? {};
              const tool = typeof payload.tool === 'string' ? payload.tool : task.title ?? 'computer task';
              const workspace = typeof payload.workspace === 'string' ? payload.workspace : '—';
              const tier = typeof payload.tier === 'string' ? payload.tier : '—';
              return (
                <div key={task.id} className="grid gap-2 py-2.5 md:grid-cols-[1.4fr_.8fr_.7fr_.7fr] md:items-center">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-zinc-200">{tool}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">{task.target_device ?? 'unassigned'}</div>
                  </div>
                  <div className="truncate text-xs text-zinc-400">{workspace}</div>
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">{tier}</div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase text-zinc-300">{task.status}</span>
                    <span className="text-[10px] text-zinc-600">{new Date(task.created_at).toLocaleTimeString('en-GB')}</span>
                  </div>
                </div>
              );
            })}
            {!loading && tasks.length === 0 && <DashLeeg>No computer-use runs yet. Read-only runs go automatically; writes need policy or approval.</DashLeeg>}
          </div>
        </DashKaart>
      </DashRaster>
    </DashSchil>
    </div>
  );
}
