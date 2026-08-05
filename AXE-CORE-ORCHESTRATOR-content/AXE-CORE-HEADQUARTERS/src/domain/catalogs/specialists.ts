/** Canonical specialist roster for CrewAI and agent routing. */

export type Specialist = {
  id: string;
  name: string;
  role: string;
  focus: string;
  emoji: string;
  color?: string;
};

export const SPECIALISTS: Specialist[] = [
  {
    id: 'axe_core',
    name: 'AXE Core',
    role: 'Orchestrator',
    focus: 'Routes work, synthesizes specialist output, final answers',
    emoji: '',
  },
  {
    id: 'wolf',
    name: 'Wolf',
    role: 'Strategy',
    focus: 'Positioning, prioritization, go-to-market',
    emoji: '',
  },
  {
    id: 'dollar_bill',
    name: 'Dollar Bill',
    role: 'Finance',
    focus: 'Markets, P&L, risk, trading context',
    emoji: '',
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Research',
    focus: 'Web intel, competitive scans, source triangulation',
    emoji: '',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Security',
    focus: 'Threat model, access, compliance checks',
    emoji: '',
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Engineering',
    focus: 'Implementation plans, architecture, code paths',
    emoji: '',
  },
  {
    id: 'signal',
    name: 'Signal',
    role: 'Communications',
    focus: 'Messaging, narrative, stakeholder updates',
    emoji: '',
  },
  {
    id: 'cartographer',
    name: 'Cartographer',
    role: 'Systems',
    focus: 'Maps dependencies, data flows, org topology',
    emoji: '',
  },
  {
    id: 'nova',
    name: 'Nova',
    role: 'Creative',
    focus: 'Concepts, product naming, UX framing',
    emoji: '',
  },
];
