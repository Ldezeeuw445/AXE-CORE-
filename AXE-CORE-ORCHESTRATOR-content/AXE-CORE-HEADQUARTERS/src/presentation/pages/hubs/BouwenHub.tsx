import { useNavigate } from 'react-router';
import { FileCode, Compass, Monitor, TerminalSquare, LayoutGrid, Workflow, Sparkles } from 'lucide-react';
import { PageHeader, AxeCard } from '@/presentation/components/ui/AxeUI';

const LINKS: ReadonlyArray<{ path: string; label: string; note: string; Icon: typeof FileCode }> = [
  { path: '/code-editor', label: 'Code', note: 'Monaco + agent edits', Icon: FileCode },
  { path: '/browser', label: 'Browser', note: 'In-app browser use', Icon: Compass },
  { path: '/computer-use', label: 'Computer Use', note: 'Desktop control', Icon: Monitor },
  { path: '/terminals', label: 'Terminals', note: 'Mac mini · iMac · VPS', Icon: TerminalSquare },
  { path: '/apps', label: 'Apps', note: 'Registered products', Icon: LayoutGrid },
  { path: '/control-plane', label: 'Control Plane', note: 'Schedulers & jobs', Icon: Workflow },
  { path: '/developer', label: 'Command Center', note: 'Dev tools', Icon: Sparkles },
];

export default function BouwenHub() {
  const navigate = useNavigate();
  return (
    <div className="axe-tabruimte h-full overflow-y-auto pt-4 pb-6 sm:pt-5">
      <PageHeader
        eyebrow="Build"
        title="Bouwen"
        description="Code, browser, computer use and terminals — one place. Deep routes stay; this is the door."
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
