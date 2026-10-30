import { useNavigate } from 'react-router';
import {
  Settings, Smartphone, Clock, Cable, Wallet, Table2, Database, BookMarked, Share2,
  Network, CalendarDays, ListTodo, BookOpenCheck, Newspaper, Megaphone,
} from 'lucide-react';
import { PageHeader, AxeCard } from '@/presentation/components/ui/AxeUI';

const LINKS: ReadonlyArray<{ path: string; label: string; note: string; Icon: typeof Settings }> = [
  { path: '/settings', label: 'Settings', note: 'Preferences & keys', Icon: Settings },
  { path: '/device', label: 'Devices', note: 'Phone + AXE installs', Icon: Smartphone },
  { path: '/cron-manager', label: 'Cron', note: 'Schedules', Icon: Clock },
  { path: '/mcp', label: 'MCP', note: 'Tool servers', Icon: Cable },
  { path: '/finance', label: 'Finance', note: 'Budget', Icon: Wallet },
  { path: '/table-editor', label: 'Tables', note: 'DB editor', Icon: Table2 },
  { path: '/memory', label: 'Geheugen', note: 'Memory · Obsidian · KB', Icon: Database },
  { path: '/obsidian', label: 'Obsidian', note: 'Vault', Icon: Share2 },
  { path: '/knowledge', label: 'Knowledge', note: 'Docs', Icon: BookMarked },
  { path: '/infrastructure', label: 'Infrastructure', note: 'Stack status', Icon: Network },
  { path: '/calendar', label: 'Calendar', note: 'Agenda', Icon: CalendarDays },
  { path: '/tasks', label: 'Tasks', note: 'Durable queue', Icon: ListTodo },
  { path: '/ledger', label: 'Ledger', note: 'Job runs', Icon: BookOpenCheck },
  { path: '/brief', label: 'Daily Brief', note: 'What happened', Icon: Newspaper },
  { path: '/crewai', label: 'CrewAI', note: 'Crew runs', Icon: Megaphone },
];

export default function SysteemHub() {
  const navigate = useNavigate();
  return (
    <div className="axe-tabruimte h-full overflow-y-auto pt-4 pb-6 sm:pt-5">
      <PageHeader
        eyebrow="System"
        title="Systeem"
        description="Settings, devices, memory, cron and the rest — secondary doors, not primary nav."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ path, label, note, Icon }) => (
          <AxeCard key={path} hover onClick={() => navigate(path)} className="flex items-start gap-3">
            <Icon size={20} style={{ color: 'var(--accent-cyan)' }} />
            <span>
              <span className="block text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{note}</span>
            </span>
          </AxeCard>
        ))}
      </div>
    </div>
  );
}
