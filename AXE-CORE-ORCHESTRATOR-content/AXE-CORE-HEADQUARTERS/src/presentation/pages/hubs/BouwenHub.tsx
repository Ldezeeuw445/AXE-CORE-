import { HubV3 } from '@/presentation/components/v3/HubV3';

export default function BouwenHub() {
  return (
    <HubV3
      tab="bouwen"
      title="Bouwen"
      sub="Build · ship · projects"
      tiles={[
        { id: 'repos', label: 'Repos', note: 'GitHub repos', badge: 'stage', badgeTone: 'stage', path: '/developer' },
        { id: 'prs', label: 'PRs', note: 'Open pull requests', badge: 'stage', badgeTone: 'stage', path: '/developer' },
        { id: 'ci', label: 'CI', note: 'Build status', badge: 'docs', badgeTone: 'docs', path: '/control-plane' },
        { id: 'eve', label: 'EVE', note: 'Agent builds', badge: 'stage', badgeTone: 'stage', path: '/bouwen' },
        { id: 'code', label: 'Code', note: 'Monaco + Ask AXE', badge: 'live', badgeTone: 'live', path: '/code-editor' },
        { id: 'tasks', label: 'Tasks', note: 'Build queue', badge: 'docs', badgeTone: 'docs', path: '/tasks' },
      ]}
    />
  );
}
