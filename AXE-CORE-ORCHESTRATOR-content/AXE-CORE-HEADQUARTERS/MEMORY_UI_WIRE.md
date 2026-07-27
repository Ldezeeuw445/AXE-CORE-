# Wire Obsidian tab into Memory.tsx (3 surgical edits)

`ObsidianMemoryPanel` is ready at:
`src/presentation/components/axe-core/ObsidianMemoryPanel.tsx`

Apply these edits in `src/presentation/pages/Memory.tsx`:

## 1. Import (after hudBackground import)
```ts
import ObsidianMemoryPanel from '@/presentation/components/axe-core/ObsidianMemoryPanel';
```

## 2. Default tab + type
```ts
const [activeTab, setActiveTab] = useState<'explorer' | 'core-memory' | 'ai-memory' | 'agents' | 'obsidian'>('obsidian');
```

## 3. Tab bar — put Obsidian first
```ts
{([
  { id: 'obsidian',    label: '📓 Obsidian',     desc: 'Durable co-founder notes' },
  { id: 'agents',      label: '🤖 Agents',       desc: 'Per-agent memory' },
  { id: 'ai-memory',   label: '🌐 AI Memory',    desc: 'Live agent memory' },
  { id: 'core-memory', label: '🧠 Core Memory',  desc: 'Echte Supabase data' },
  { id: 'explorer',    label: '🗄️ DB Explorer',  desc: 'Schema browser' },
] as const).map(tab => (
```

## 4. Tab content — add branch before agents
```tsx
{activeTab === 'obsidian' ? (
  <div className="flex-1 overflow-hidden">
    <ObsidianMemoryPanel />
  </div>
) : activeTab === 'agents' ? (
  ...
```

## voiceStore wiring (already documented in SESSION_HANDOFF)

1. Import:
```ts
import { reflectOnToolDecision } from '@/infrastructure/persistence/reflectionService';
import { buildDurableMemoryContext } from '@/infrastructure/persistence/buildDurableMemoryContext';
```

2. In `requestActionApproval` after auto-approve / and in `resolvePendingExec` after recordTrustDecision, call:
```ts
void reflectOnToolDecision(kind, `${title}\n${detail}`, approved ? 'approved' : 'denied');
// or for auto: 'auto_run'
```

3. Replace `buildGlobalMemoryContext(...)` with `buildDurableMemoryContext(AXE_USER_ID, text, 2800)`.
