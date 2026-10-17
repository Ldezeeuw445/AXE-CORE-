/**
 * A17-schil die op élke telefoontab hetzelfde is: bel rechtsboven,
 * 44px Approve/Decline als er iets wacht, onderbalk (pinbaar) + More.
 *
 * Desktop-Home blijft de live dashboard-layout; dit component hangt alleen
 * aan `mobileCommandSurface` in AppShell.
 */
import { useEffect, useState } from 'react';
import {
  Bell, Code2, Compass, Database, Globe, Home, LayoutGrid, LineChart,
  Settings, Sparkles, Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { AwarenessCenter } from '@/presentation/components/axe-core/AwarenessCenter';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { rijenVanLijst } from '@/domain/agents/pendingApproval';
import { goedkeuringVanActie, openGoedkeuringen } from '@/domain/agentBewustzijn';
import { PHONE_TABS, phoneTabActief, phoneTabDoel } from '@/domain/phone/phoneChrome';
import {
  balkTabs, leesPhonePins, PHONE_PIN_KEY, type PhonePin,
} from '@/domain/phone/phonePins';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';

const TAB_ICON: Record<string, typeof Home> = {
  home: Home,
  trading: LineChart,
  companion: Sparkles,
  memory: Database,
  more: LayoutGrid,
  northsea: Compass,
  browser: Globe,
  developer: Code2,
  agents: Users,
  systems: LayoutGrid,
  tasks: LayoutGrid,
  settings: Settings,
  calendar: LayoutGrid,
  devices: LayoutGrid,
};

export function PhoneBel() {
  const show = useCoreViewStore((s) => s.showAwareness);
  const setShow = useCoreViewStore((s) => s.setShowAwareness);
  const jobs = useAxeJobStore((s) => s.jobs);
  const pendingExec = useVoiceStore((s) => s.pendingExec);
  const serverOk = useServerAgents().approvals.length;
  const wacht = openGoedkeuringen(jobs).length
    + (pendingExec && goedkeuringVanActie({ title: pendingExec.title, detail: pendingExec.detail }) ? 1 : 0)
    + serverOk;

  return (
    <span className="relative">
      <button
        type="button"
        className="axe-phone-bel flex size-9 items-center justify-center rounded-full active:scale-95"
        aria-label={wacht ? `Notifications, ${wacht} waiting` : 'Notifications'}
        aria-pressed={show}
        onClick={() => setShow(!show)}
        style={{
          background: 'var(--surface-bg)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        <Bell size={16} />
        {wacht > 0 && (
          <i
            aria-hidden="true"
            className="absolute right-1 top-1 size-1.5 rounded-full"
            style={{ background: 'var(--warning)' }}
          />
        )}
      </button>
      {show && <AwarenessCenter onClose={() => setShow(false)} hoek="rechts" />}
    </span>
  );
}

export function PhoneVoet({ toonTabs }: { toonTabs: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [pins, setPins] = useState<PhonePin[]>(() => leesPhonePins());
  const server = useServerAgents();
  const jobs = useAxeJobStore((s) => s.jobs);
  const rijen = rijenVanLijst(server.approvals);
  const gezien = new Set(rijen.map((r) => r.id));
  for (const j of jobs) {
    if (j.state !== 'waiting' || !j.approvalId || !j.taskId || gezien.has(j.approvalId)) continue;
    gezien.add(j.approvalId);
    rijen.push({
      id: j.approvalId,
      taskId: j.taskId,
      wat: j.approvalVraag || j.title || 'Needs your OK',
      waarom: '',
    });
  }

  useEffect(() => {
    const lees = () => setPins(leesPhonePins());
    window.addEventListener('storage', lees);
    window.addEventListener('axe-phone-pins', lees);
    return () => {
      window.removeEventListener('storage', lees);
      window.removeEventListener('axe-phone-pins', lees);
    };
  }, []);

  const tabs = pins.length ? balkTabs(pins) : [...PHONE_TABS];

  return (
    <div className="axe-phone-voet relative z-[60] w-full flex-none" data-axe-phone-voet>
      {rijen.length > 0 && (
        <div className="axe-phone-ok px-1 pb-1.5" data-axe-phone-ok>
          <GoedkeuringActie
            touch
            rijen={rijen}
            onBeslis={(rij, akkoord) => {
              void beslisAgentOk({
                akkoord,
                rij,
                reden: akkoord ? 'Approved on phone.' : 'Declined on phone.',
              }).then(verversServerAgents);
            }}
          />
        </div>
      )}
      {toonTabs && (
        <nav className="axe-phone-tabs" aria-label="Phone tabs" data-axe-phone-tabs>
          {tabs.map((tab) => {
            const Icon = TAB_ICON[tab.id] ?? LayoutGrid;
            const aan = phoneTabActief(location.pathname, tab, tabs);
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={aan ? 'page' : undefined}
                aria-label={tab.label}
                data-aan={aan ? 'ja' : undefined}
                onClick={() => navigate(phoneTabDoel(tab.path))}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export { PHONE_PIN_KEY };
