export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'active' | 'warning' | 'offline' | 'standby';
  initials: string;
  avatarColor: string;
  mcpCount: number;
  taskCount: number;
  performance: number;
  description?: string;
}

export interface IntelligenceFeedItem {
  id: string;
  type: 'MEETING' | 'WARN' | 'TIP' | 'LIVE' | 'FOCUS';
  title: string;
  description: string;
  timestamp: string;
  icon: string;
}

export interface SystemMetrics {
  cpu: number;
  ram: number;
  disk: number;
  ramUsed: string;
  ramTotal: string;
  diskUsed: string;
  diskTotal: string;
  processes: number;
  load: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  status: 'connected' | 'standby' | 'not-linked' | 'available';
  latency: number | null;
}

export interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  status: 'done' | 'in-progress' | 'upcoming';
  relativeTime: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
}

export interface RecentActivity {
  id: string;
  agent: string;
  description: string;
  timestamp: string;
  icon: string;
  action?: string;
}

export const agents: Agent[] = [
  { id: '1', name: 'AXE Core', role: 'Central Intelligence', status: 'active', initials: 'AX', avatarColor: 'from-cyan-500 to-blue-600', mcpCount: 8, taskCount: 3, performance: 99 },
  { id: '2', name: 'Coding Agent', role: 'Software Development', status: 'active', initials: 'CD', avatarColor: 'from-emerald-500 to-green-600', mcpCount: 5, taskCount: 2, performance: 94 },
  { id: '3', name: 'Research Agent', role: 'Intelligence Gathering', status: 'active', initials: 'RS', avatarColor: 'from-blue-500 to-indigo-600', mcpCount: 4, taskCount: 1, performance: 91 },
  { id: '4', name: 'Memory Agent', role: 'Knowledge Management', status: 'standby', initials: 'MM', avatarColor: 'from-violet-500 to-purple-600', mcpCount: 3, taskCount: 0, performance: 88 },
  { id: '5', name: 'Browser Agent', role: 'Web Automation', status: 'active', initials: 'BR', avatarColor: 'from-sky-500 to-blue-500', mcpCount: 4, taskCount: 2, performance: 92 },
  { id: '6', name: 'Task Agent', role: 'Task Orchestration', status: 'standby', initials: 'TS', avatarColor: 'from-amber-500 to-yellow-600', mcpCount: 3, taskCount: 0, performance: 85 },
  { id: '7', name: 'System Agent', role: 'Infrastructure', status: 'active', initials: 'SY', avatarColor: 'from-slate-500 to-gray-600', mcpCount: 6, taskCount: 4, performance: 97 },
  { id: '8', name: 'Trading Agent', role: 'Market Operations', status: 'standby', initials: 'TR', avatarColor: 'from-orange-500 to-red-500', mcpCount: 4, taskCount: 0, performance: 89 },
  { id: '9', name: 'Finance Agent', role: 'Financial Management', status: 'standby', initials: 'FN', avatarColor: 'from-emerald-600 to-teal-600', mcpCount: 3, taskCount: 0, performance: 90 },
  { id: '10', name: 'Strategy Agent', role: 'Strategic Planning', status: 'standby', initials: 'ST', avatarColor: 'from-purple-500 to-pink-600', mcpCount: 2, taskCount: 0, performance: 87 },
  { id: '11', name: 'Marketing Agent', role: 'Growth & Marketing', status: 'standby', initials: 'MK', avatarColor: 'from-rose-500 to-pink-500', mcpCount: 3, taskCount: 0, performance: 86 },
  { id: '12', name: 'Automation Agent', role: 'Workflow Automation', status: 'standby', initials: 'AU', avatarColor: 'from-orange-400 to-amber-500', mcpCount: 5, taskCount: 0, performance: 93 },
  { id: '13', name: 'Email Agent', role: 'Communication Hub', status: 'standby', initials: 'EM', avatarColor: 'from-sky-400 to-cyan-500', mcpCount: 2, taskCount: 0, performance: 84 },
  { id: '14', name: 'Support Agent', role: 'User Assistance', status: 'standby', initials: 'SP', avatarColor: 'from-pink-400 to-rose-500', mcpCount: 2, taskCount: 0, performance: 88 },
  { id: '15', name: 'Vision Agent', role: 'Visual Analysis', status: 'standby', initials: 'VS', avatarColor: 'from-indigo-500 to-violet-600', mcpCount: 3, taskCount: 0, performance: 91 },
  { id: '16', name: 'Voice Agent', role: 'Audio Processing', status: 'standby', initials: 'VC', avatarColor: 'from-cyan-400 to-teal-500', mcpCount: 2, taskCount: 0, performance: 90 },
  { id: '17', name: 'Security Agent', role: 'Threat Detection', status: 'standby', initials: 'SC', avatarColor: 'from-red-500 to-red-700', mcpCount: 4, taskCount: 0, performance: 95 },
  { id: '18', name: 'Dev Agent', role: 'DevOps & CI/CD', status: 'standby', initials: 'DV', avatarColor: 'from-lime-500 to-green-600', mcpCount: 5, taskCount: 0, performance: 92 },
  { id: '19', name: 'Design Agent', role: 'UI/UX Design', status: 'standby', initials: 'DS', avatarColor: 'from-fuchsia-500 to-purple-600', mcpCount: 3, taskCount: 0, performance: 89 },
  { id: '20', name: 'Document Agent', role: 'Doc Processing', status: 'standby', initials: 'DC', avatarColor: 'from-gray-500 to-slate-600', mcpCount: 2, taskCount: 0, performance: 87 },
  { id: '21', name: 'Meeting Agent', role: 'Meeting Coordination', status: 'standby', initials: 'MT', avatarColor: 'from-yellow-400 to-amber-500', mcpCount: 3, taskCount: 0, performance: 88 },
  { id: '22', name: 'Learning Agent', role: 'Skill Acquisition', status: 'standby', initials: 'LN', avatarColor: 'from-teal-400 to-cyan-600', mcpCount: 2, taskCount: 0, performance: 85 },
  { id: '23', name: 'Assistant', role: 'Personal Assistant', status: 'standby', initials: 'AS', avatarColor: 'from-emerald-400 to-green-500', mcpCount: 4, taskCount: 0, performance: 90 },
  {
    id: 'axe-companion',
    name: 'AXE Companion',
    role: 'Personal Assistant',
    status: 'active',
    avatarColor: 'from-green-400 to-emerald-500',
    initials: 'CP',
    mcpCount: 6,
    taskCount: 4,
    performance: 96,
    description: 'Your personal AI companion for daily tasks and scheduling'
  },
  {
    id: 'axe-intel',
    name: 'AXE Intel',
    role: 'Intelligence & Analysis',
    status: 'active',
    avatarColor: 'from-cyan-400 to-blue-500',
    initials: 'IN',
    mcpCount: 8,
    taskCount: 7,
    performance: 94,
    description: 'Deep intelligence gathering and market analysis agent'
  },
];

export const activeAgents = agents.filter(
  (a) => a.status === 'active' || a.status === 'standby'
).slice(0, 6);

export const intelligenceFeed: IntelligenceFeedItem[] = [
  { id: '1', type: 'MEETING', title: 'Design review with the product team at 11 AM', description: 'Discuss Command Center V1 progress', timestamp: '10:42 AM', icon: 'briefcase' },
  { id: '2', type: 'WARN', title: '2 tasks are overdue', description: '"Polish voice pipeline" and "Update docs"', timestamp: '10:38 AM', icon: 'alert-triangle' },
  { id: '3', type: 'TIP', title: '3 pull requests awaiting your review', description: 'In repository axe-command-center', timestamp: '10:30 AM', icon: 'lightbulb' },
  { id: '4', type: 'TIP', title: 'Your deep-work block is 2-4 PM', description: 'Notifications will be silenced', timestamp: '10:15 AM', icon: 'lightbulb' },
  { id: '5', type: 'LIVE', title: 'CPU usage at 15%', description: 'System load nominal', timestamp: 'Just now', icon: 'activity' },
  { id: '6', type: 'WARN', title: 'Memory usage climbing', description: 'RAM at 72% — consider closing idle agents', timestamp: '9:58 AM', icon: 'alert-triangle' },
  { id: '7', type: 'FOCUS', title: 'Focus mode activated', description: 'Deep work session until 4:00 PM', timestamp: '9:30 AM', icon: 'target' },
  { id: '8', type: 'LIVE', title: 'Claude 3.5 Sonnet responding', description: 'Average latency 42ms', timestamp: 'Just now', icon: 'zap' },
];

export const systemMetrics: SystemMetrics = {
  cpu: 15,
  ram: 54,
  disk: 40,
  ramUsed: '8.6',
  ramTotal: '16',
  diskUsed: '429',
  diskTotal: '1024',
  processes: 247,
  load: 'Low',
};

export const llmProviders: LLMProvider[] = [
  { id: '1', name: 'Claude', status: 'connected', latency: 45 },
  { id: '2', name: 'OpenAI', status: 'not-linked', latency: null },
  { id: '3', name: 'Gemini', status: 'standby', latency: 78 },
  { id: '4', name: 'Groq', status: 'connected', latency: 28 },
  { id: '5', name: 'OpenRouter', status: 'connected', latency: 51 },
  { id: '6', name: 'Ollama', status: 'available', latency: null },
  { id: '7', name: 'Claude Code', status: 'connected', latency: 33 },
  { id: '8', name: 'Cursor', status: 'connected', latency: 41 },
  { id: '9', name: 'Copilot', status: 'standby', latency: 55 },
];

export const timelineEvents: TimelineEvent[] = [
  { id: '1', time: '09:00', title: 'Daily Standup', status: 'done', relativeTime: 'Done' },
  { id: '2', time: '10:00', title: 'Finalize HUD panel spacing', status: 'in-progress', relativeTime: 'In 12m' },
  { id: '3', time: '12:00', title: 'Deep-work block: Voice pipeline', status: 'upcoming', relativeTime: 'In 2h 42m' },
  { id: '4', time: '14:30', title: 'Design Review — Command Center V1', status: 'upcoming', relativeTime: 'In 5h 12m' },
  { id: '5', time: '16:00', title: 'Executive Briefing prep', status: 'upcoming', relativeTime: 'In 6h 42m' },
];

export const quickActions: QuickAction[] = [
  { id: '1', label: 'Start New Task', icon: 'plus' },
  { id: '2', label: 'Open Calendar', icon: 'calendar' },
  { id: '3', label: 'Start Voice Chat', icon: 'mic' },
  { id: '4', label: 'Run Workflow', icon: 'play' },
  { id: '5', label: 'Open Command', icon: 'terminal' },
  { id: '6', label: 'Create Note', icon: 'file-plus' },
];

export const recentActivities: RecentActivity[] = [
  { id: '1', agent: 'Coding Agent', description: 'Completed task "Refactor auth module"', timestamp: '2 minutes ago', icon: 'code', action: 'View' },
  { id: '2', agent: 'Memory Agent', description: 'Stored 12 new memories from chat session', timestamp: '5 minutes ago', icon: 'database' },
  { id: '3', agent: 'Trading Agent', description: 'Executed BUY order #2847 @ 1.2450', timestamp: '8 minutes ago', icon: 'trending-up', action: 'View' },
  { id: '4', agent: 'Research Agent', description: 'Completed report "Market Analysis Q2"', timestamp: '12 minutes ago', icon: 'search', action: 'Open' },
  { id: '5', agent: 'System', description: 'Auto-backup completed (2.4 MB)', timestamp: '15 minutes ago', icon: 'shield' },
  { id: '6', agent: 'Browser Agent', description: 'Scraped 47 product listings from Amazon', timestamp: '22 minutes ago', icon: 'globe' },
];

export const memoryStats = {
  memories: 3380,
  sessions: 22,
  topicTurns: 4847,
  totalChats: 14,
};

export const aiCoreStatus = [
  { label: 'Active', status: 'online', value: '25 agents', icon: 'circle' },
  { label: 'Memory', status: 'active', value: '3,380 Stored', detail: '22 topics', icon: 'brain' },
  { label: 'Voice', status: 'active', value: 'Online', detail: 'Ready', icon: 'mic' },
  { label: 'Agents', status: 'active', value: '8 Running', detail: '25 total', icon: 'bot' },
  { label: 'LLMs', status: 'online', value: '8 Connected', detail: 'All healthy', icon: 'plug' },
  { label: 'System', status: 'online', value: 'Optimal', detail: 'CPU 15%', icon: 'zap' },
];

export const connectedModels = [
  { name: 'Claude 3.5 Sonnet', usage: 78 },
  { name: 'GPT-4o', usage: 52 },
  { name: 'Groq Llama 3', usage: 35 },
  { name: 'Gemini Pro', usage: 28 },
];

export const activeTasks = [
  { id: '1', title: 'Refactor auth module', progress: 85, completed: false },
  { id: '2', title: 'Polish voice pipeline UI', progress: 60, completed: false },
  { id: '3', title: 'Update agent documentation', progress: 30, completed: false },
  { id: '4', title: 'Design review preparation', progress: 100, completed: true },
];

export const calendarEvents = [
  { id: 1, title: 'Daily Standup', date: '2026-07-07', time: '09:00', duration: 30, type: 'meeting' },
  { id: 2, title: 'Design Review', date: '2026-07-07', time: '14:30', duration: 60, type: 'meeting' },
  { id: 3, title: 'Polish voice pipeline', date: '2026-07-08', time: '10:00', duration: 120, type: 'task' },
  { id: 4, title: 'Update documentation', date: '2026-07-08', time: '13:00', duration: 90, type: 'task' },
  { id: 5, title: 'Agent performance review', date: '2026-07-09', time: '11:00', duration: 45, type: 'meeting' },
  { id: 6, title: 'Deep-work block', date: '2026-07-09', time: '14:00', duration: 120, type: 'focus' },
  { id: 7, title: 'Weekly Planning', date: '2026-07-10', time: '09:30', duration: 60, type: 'meeting' },
  { id: 8, title: 'Trading strategy review', date: '2026-07-10', time: '16:00', duration: 45, type: 'task' },
  { id: 9, title: 'Infrastructure audit', date: '2026-07-11', time: '10:00', duration: 180, type: 'task' },
  { id: 10, title: 'Team Sync', date: '2026-07-14', time: '15:00', duration: 30, type: 'meeting' },
  { id: 11, title: 'AXE Core upgrade', date: '2026-07-15', time: '09:00', duration: 240, type: 'task' },
  { id: 12, title: 'Security review', date: '2026-07-16', time: '11:00', duration: 90, type: 'meeting' },
  { id: 13, title: 'Client presentation', date: '2026-07-18', time: '14:00', duration: 60, type: 'meeting' },
  { id: 14, title: 'Monthly retrospective', date: '2026-07-21', time: '10:00', duration: 60, type: 'meeting' },
  { id: 15, title: 'Q3 Roadmap planning', date: '2026-07-23', time: '13:00', duration: 120, type: 'task' },
];

export const infrastructureNodes = [
  { id: 'axe-core', name: 'AXE Core', type: 'core', status: 'online', connections: 8, color: '#22D3EE' },
  { id: 'axe-companion', name: 'AXE Companion', type: 'core', status: 'online', connections: 4, color: '#10B981' },
  { id: 'axe-intel', name: 'AXE Intel', type: 'core', status: 'online', connections: 5, color: '#3B82F6' },
  { id: 'supabase', name: 'Supabase', type: 'service', status: 'online', connections: 3, color: '#3ECF8E' },
  { id: 'cloudflare', name: 'Cloudflare', type: 'service', status: 'online', connections: 4, color: '#F48120' },
  { id: 'vercel', name: 'Vercel', type: 'service', status: 'online', connections: 2, color: '#FFFFFF' },
  { id: 'railway', name: 'Railway', type: 'service', status: 'online', connections: 2, color: '#8B5CF6' },
  { id: 'resend', name: 'Resend', type: 'service', status: 'online', connections: 1, color: '#000000' },
  { id: 'coding', name: 'Coding Agent', type: 'agent', status: 'online', connections: 2, color: '#22D3EE' },
  { id: 'trading', name: 'Trading Agent', type: 'agent', status: 'online', connections: 2, color: '#F59E0B' },
  { id: 'research', name: 'Research Agent', type: 'agent', status: 'idle', connections: 1, color: '#8B5CF6' },
  { id: 'memory', name: 'Memory Agent', type: 'agent', status: 'idle', connections: 1, color: '#EC4899' },
  { id: 'vision', name: 'Vision Agent', type: 'agent', status: 'online', connections: 1, color: '#06B6D4' },
  { id: 'browser', name: 'Browser Agent', type: 'agent', status: 'online', connections: 1, color: '#3B82F6' },
];

export const infrastructureLinks = [
  { source: 'axe-core', target: 'axe-companion' },
  { source: 'axe-core', target: 'axe-intel' },
  { source: 'axe-core', target: 'coding' },
  { source: 'axe-core', target: 'trading' },
  { source: 'axe-core', target: 'research' },
  { source: 'axe-core', target: 'memory' },
  { source: 'axe-core', target: 'vision' },
  { source: 'axe-core', target: 'browser' },
  { source: 'supabase', target: 'memory' },
  { source: 'cloudflare', target: 'axe-core' },
  { source: 'vercel', target: 'axe-core' },
  { source: 'railway', target: 'axe-intel' },
  { source: 'resend', target: 'axe-companion' },
];

export const memoryTreeData = {
  id: 'root',
  name: 'AXE Memory',
  type: 'root',
  children: [
    {
      id: 'supabase',
      name: 'Supabase',
      type: 'service',
      status: 'connected',
      children: [
        {
          id: 'auth',
          name: 'auth',
          type: 'schema',
          children: [
            { id: 'users', name: 'users', type: 'table', rows: 2847, lastUpdated: '2 min ago' },
            { id: 'sessions', name: 'sessions', type: 'table', rows: 412, lastUpdated: '5 min ago' },
          ]
        },
        {
          id: 'public',
          name: 'public',
          type: 'schema',
          children: [
            { id: 'agents', name: 'agents', type: 'table', rows: 25, lastUpdated: '1 min ago' },
            { id: 'tasks', name: 'tasks', type: 'table', rows: 156, lastUpdated: '3 min ago' },
            { id: 'memories', name: 'memories', type: 'table', rows: 3380, lastUpdated: '30 sec ago' },
            { id: 'conversations', name: 'conversations', type: 'table', rows: 847, lastUpdated: '1 min ago' },
          ]
        },
        {
          id: 'storage',
          name: 'storage',
          type: 'schema',
          children: [
            { id: 'buckets', name: 'buckets (3)', type: 'storage', size: '2.4 GB' },
          ]
        }
      ]
    },
    {
      id: 'cloudflare',
      name: 'Cloudflare',
      type: 'service',
      status: 'connected',
      children: [
        { id: 'd1', name: 'D1 Database', type: 'database', rows: 12503 },
        { id: 'r2', name: 'R2 Storage', type: 'storage', size: '8.7 GB' },
        { id: 'kv', name: 'KV Store', type: 'kv', entries: 2847 },
        { id: 'workers', name: 'Workers', type: 'compute', active: 12 },
      ]
    },
    {
      id: 'local',
      name: 'Local Storage',
      type: 'local',
      children: [
        { id: 'cache', name: 'cache', type: 'folder', size: '156 MB' },
        { id: 'settings', name: 'settings', type: 'folder', entries: 24 },
        { id: 'logs', name: 'logs', type: 'folder', size: '45 MB' },
      ]
    },
    {
      id: 'mcp',
      name: 'MCP Servers',
      type: 'mcp',
      children: [
        { id: 'mcp-filesystem', name: 'filesystem', type: 'mcp-server', status: 'active' },
        { id: 'mcp-browser', name: 'browser', type: 'mcp-server', status: 'active' },
        { id: 'mcp-database', name: 'database', type: 'mcp-server', status: 'standby' },
      ]
    }
  ]
};
