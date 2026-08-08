/**
 * MemoryHub — visual entry point for AXE memory.
 * Default tab = Library (growth + manager + neural + recent notes).
 * Classic DB explorer / agent panels remain at /memory/explore.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { BookOpen, Library, Network } from 'lucide-react';
import MemoryLibraryPanel from '@/presentation/components/axe-core/MemoryLibraryPanel';
import ObsidianMemoryPanel from '@/presentation/components/axe-core/ObsidianMemoryPanel';
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { HUD_BASE_BG } from '@/presentation/styles/hudBackground';

type HubTab = 'library' | 'obsidian' | 'neural';

export default function MemoryHub() {
  const [tab, setTab] = useState<HubTab>('library');
  const navigate = useNavigate();

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: HUD_BASE_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div
        className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        {(
          [
            { id: 'library' as const, label: 'Library', desc: 'Growth + brain' },
            { id: 'neural' as const, label: 'Terrain', desc: 'Volumetric memory terrain' },
            { id: 'obsidian' as const, label: 'Obsidian', desc: 'Notes + links' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="relative px-4 py-2 text-[12px] font-medium transition-colors rounded-t-lg"
            style={{
              color: tab === t.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
              background: tab === t.id ? 'rgba(34,211,238,0.06)' : 'transparent',
              borderBottom:
                tab === t.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => navigate('/obsidian')}
          className="flex items-center gap-1.5 px-3 py-1.5 mb-1 rounded-lg text-[10px] font-medium"
          style={{
            background: 'rgba(139,92,246,0.12)',
            color: '#c4b5fd',
            border: '1px solid rgba(139,92,246,0.3)',
          }}
          title="Full neural graph + vault sync"
        >
          <Network size={11} /> Full graph
        </button>
        <button
          type="button"
          onClick={() => navigate('/memory/explore')}
          className="flex items-center gap-1.5 px-3 py-1.5 mb-1 rounded-lg text-[10px] font-medium"
          style={{
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
          }}
          title="Agents · AI memory · Core · DB explorer"
        >
          <BookOpen size={11} /> Explorer
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'library' ? (
          <MemoryLibraryPanel />
        ) : tab === 'neural' ? (
          <NeuralMemorySystem />
        ) : (
          <ObsidianMemoryPanel />
        )}
      </div>

      <div
        className="flex-shrink-0 px-4 py-1.5 flex items-center gap-2 text-[9px] font-mono"
        style={{ borderTop: '1px solid var(--border-subtle)', color: 'rgba(255,255,255,0.25)' }}
      >
        <Library size={10} />
        Durable brain active · chat injects GraphRAG context · Memory Manager on boot
      </div>
    </motion.div>
  );
}
