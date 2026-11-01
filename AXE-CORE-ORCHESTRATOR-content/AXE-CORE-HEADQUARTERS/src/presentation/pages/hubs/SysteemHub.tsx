import { HubV3 } from '@/presentation/components/v3/HubV3';

export default function SysteemHub() {
  return (
    <HubV3
      tab="systeem"
      title="Systeem"
      sub="Infra · MCP · terminals · control"
      tiles={[
        { id: 'infra', label: 'Infra', note: 'Stack status', badge: 'docs', badgeTone: 'docs', path: '/infrastructure' },
        { id: 'mcp', label: 'MCP', note: 'Tool servers', badge: 'docs', badgeTone: 'docs', path: '/mcp' },
        { id: 'terminals', label: 'Terminals', note: 'Mac · iMac · VPS', badge: 'live', badgeTone: 'live', path: '/terminals' },
        { id: 'control', label: 'Control', note: 'Control plane', badge: 'stage', badgeTone: 'stage', path: '/control-plane' },
        { id: 'cron', label: 'Cron', note: 'Schedules', badge: 'docs', badgeTone: 'docs', path: '/cron-manager' },
        { id: 'device', label: 'Device', note: 'Phone + installs', badge: 'live', badgeTone: 'live', path: '/device' },
        { id: 'settings', label: 'Settings', note: 'Accounts · providers', path: '/settings' },
        { id: 'memory', label: 'Memory', note: 'Explore · Obsidian · KB', path: '/memory' },
        { id: 'crewai', label: 'CrewAI', note: 'Crew runs', path: '/crewai' },
      ]}
    />
  );
}
