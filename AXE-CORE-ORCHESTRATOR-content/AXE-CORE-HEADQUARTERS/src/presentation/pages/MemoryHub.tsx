/**
 * MemoryHub — visual entry point for AXE memory.
 *
 * One page, three lenses: the growth header, source counts and recent notes
 * stay put while the map slot swaps between the 3D brain, the terrain and the
 * Obsidian graph. The data-level panels (agents, AI memory, core, DB explorer)
 * live at /memory/explore.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { BookOpen, Library, Network } from 'lucide-react';
import MemoryLibraryPanel from '@/presentation/components/axe-core/MemoryLibraryPanel';
import { HUD_BASE_BG } from '@/presentation/styles/hudBackground';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

// All three tabs render the same library page; only the map slot differs.
// They were previously three separate screens, which meant switching lens
// also threw away the growth header, the source counts and the note list —
// the context that makes the visualisation mean anything.
type HubTab = 'neural' | 'terrain' | 'obsidian';

const TAB_SETTING_KEY = 'memoryHub.lens';

export default function MemoryHub() {
  const [tab, setTab] = useState<HubTab>('terrain');
  const navigate = useNavigate();

  // Which lens you prefer is a standing preference, not a per-visit choice, so
  // it is restored rather than resetting to Neural every time. saveSetting
  // writes durably, so it follows the account instead of this browser.
  useEffect(() => {
    let cancelled = false;
    void loadSetting<HubTab>(TAB_SETTING_KEY, 'terrain').then(saved => {
      // The terrain is now AXE's canonical mobile memory identity. Existing
      // "neural" defaults migrate once; an explicit terrain/obsidian choice
      // remains untouched.
      if (!cancelled && saved) setTab(saved === 'neural' ? 'terrain' : saved);
    });
    return () => { cancelled = true; };
  }, []);

  const selectTab = useCallback((id: HubTab) => {
    setTab(id);
    void saveSetting(TAB_SETTING_KEY, id);
  }, []);

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
            { id: 'neural' as const, label: 'Neural', desc: '3D brain over the library' },
            { id: 'terrain' as const, label: 'Terrain', desc: 'Volumetric memory terrain' },
            { id: 'obsidian' as const, label: 'Obsidian', desc: 'Notes + links' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
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
        <MemoryLibraryPanel visual={tab} />
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
