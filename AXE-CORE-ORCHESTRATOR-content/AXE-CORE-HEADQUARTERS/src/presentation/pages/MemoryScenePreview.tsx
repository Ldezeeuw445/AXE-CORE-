/**
 * Ontwikkelvoorbeeld voor Terrain + Neural. Buiten de login, zodat Playwright
 * de echte views kan fotograferen. Productie-Home blijft onaangeroerd.
 *
 * Geen `data-look` en geen schil-sloten: die adopteren de zijpanelen en
 * zonder AppShell-CSS liggen ze over de scene. Neural valt terug op zijn
 * eigen linker/rechter kolom; Terrain tekent de bergen zonder slotpanelen.
 *
 * `?seed=1` vult de bestaande memory-hooks via MemorySceneDataContext — de
 * views blijven dezelfde componenten, alleen de bron is een vaste steekproef
 * zodat screenshots niet van de VPS afhangen.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import NeuralBrain from '@/presentation/components/axe-core/NeuralBrain';
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { MemorySceneDataContext, type MemorySceneSeed } from '@/presentation/components/axe-core/memory/MemorySceneData';
import { collectHubRecords, agentEventsFromRecords } from '@/domain/memory/hubMemoryRecord';
import { MEMORY_HUBS } from '@/domain/memory/memoryHubs';
import './MemoryScenePreview.css';

function buildSeed(): MemorySceneSeed {
  const records = collectHubRecords({
    global: [
      { id: 'p1', category: 'user_preference', key: 'tone', value: 'Direct, no filler', created_at: '2026-10-01T09:00:00Z' },
      { id: 'p2', category: 'user_preference', key: 'theme', value: 'Dark glass', created_at: '2026-10-02T09:00:00Z' },
      { id: 't1', category: 'system_event', key: 'ta:AUDJPY:score', value: 'AUDJPY strategy scorecard', metadata: { agentId: 'axe_trader' }, created_at: '2026-10-03T11:00:00Z' },
      { id: 't2', category: 'system_event', key: 'ta:NATGAS:score', value: 'NATGAS strategy scorecard', metadata: { agentId: 'axe_trader' }, created_at: '2026-10-03T12:00:00Z' },
      { id: 'c1', category: 'conversation_context', key: 'chat:last', value: 'Morning briefing', created_at: '2026-10-04T08:00:00Z' },
    ],
    rag: [
      { id: 'k1', category: 'user', content: 'Luka prefers concise answers', importance: 9, created_at: '2026-09-12T00:00:00Z' },
      { id: 'k2', category: 'system', content: 'AXE Core routes every turn through the tier router', importance: 8, created_at: '2026-09-18T00:00:00Z' },
    ],
    notes: [
      { path: 'AXE/Resources/feeds.md', title: 'Market data feeds', content: 'Vendor list for NATGAS and FX', updated_at: '2026-10-05T00:00:00Z' },
      { path: 'AXE/Resources/docs.md', title: 'API docs', content: 'Supabase schema and broker endpoints', updated_at: '2026-10-06T00:00:00Z' },
      { path: 'AXE/Resources/natgas.md', title: 'NATGAS playbook', content: 'Seasonal storage and inventory prints', updated_at: '2026-10-07T00:00:00Z' },
    ],
  });
  const hubCounts = Object.fromEntries(
    MEMORY_HUBS.map((h) => [h.id, records.filter((r) => r.hubId === h.id).length * 120 + (h.id === 'resources' ? 90 : 12)]),
  );
  return {
    records,
    agentEvents: agentEventsFromRecords(records),
    hubCounts,
    total: Object.values(hubCounts).reduce((a, b) => a + b, 0),
  };
}

export default function MemoryScenePreview() {
  const [params] = useSearchParams();
  const view = params.get('view') === 'neural' ? 'neural' : 'terrain';
  const hub = params.get('hub');
  const seed = useMemo(() => (params.get('seed') === '1' ? buildSeed() : null), [params]);

  return (
    <MemorySceneDataContext.Provider value={seed}>
      <div
        className="msp"
        data-testid="memory-scene-preview"
        data-view={view}
      >
        {view === 'neural'
          ? <NeuralBrain initialFocusHubId={hub} />
          : <NeuralMemorySystem initialFocusHubId={hub} />}
      </div>
    </MemorySceneDataContext.Provider>
  );
}
