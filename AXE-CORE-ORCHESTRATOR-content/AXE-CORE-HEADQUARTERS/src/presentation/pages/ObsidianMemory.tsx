/** Full co-founder memory: 75% graph + 25% notes | system (3-pane). */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { LiveIndicator } from '@/presentation/components/shared/LiveIndicator';
import ObsidianMemoryPanel from '@/presentation/components/axe-core/ObsidianMemoryPanel';
import { ObsidianNeuralGraph } from '@/presentation/components/axe-core/ObsidianNeuralGraph';
import {
  listRecentObsidianNotes,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';
import { getVaultPath, vaultSyncAvailable } from '@/infrastructure/persistence/obsidianVaultSyncService';
import { HUD_BASE_BG } from '@/presentation/styles/hudBackground';

export default function ObsidianMemory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const noteFromUrl = searchParams.get('note');

  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(noteFromUrl);
  const [graphKey, setGraphKey] = useState(0);
  const vault = getVaultPath();
  const canVault = vaultSyncAvailable();

  useEffect(() => {
    if (noteFromUrl) {
      setSelectedPath(noteFromUrl);
      setGraphKey((k) => k + 1);
    }
  }, [noteFromUrl]);

  const selectPath = useCallback(
    (path: string | null) => {
      setSelectedPath(path);
      setGraphKey((k) => k + 1);
      if (path) {
        setSearchParams({ note: path }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams],
  );

  const reload = useCallback(async () => {
    const data = await listRecentObsidianNotes(120);
    setNotes(data);
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 20_000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden min-h-0"
      style={{ background: HUD_BASE_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* Neural map — exactly 3/4 of the screen (75%) */}
      <div
        className="relative overflow-hidden min-h-0"
        style={{
          flex: '3 1 0%',
          height: '75%',
          maxHeight: '75%',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: '#000',
        }}
      >
        {/* One row, not two absolutes pinned left and right: on a phone the two
            labels met in the middle and printed straight through each other. */}
        <div className="absolute top-3 left-4 right-4 z-10 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <LiveIndicator size={6} color="var(--accent-cyan)" />
            <span className="text-[10px] font-mono truncate" style={{ color: 'var(--accent-cyan)' }}>
              AXE CORE · CO-FOUNDER MEMORY · SMART VAULT
            </span>
          </span>
          <span className="hidden sm:block text-[9px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
          {canVault
            ? vault
              ? `Vault: ${vault.split('/').slice(-2).join('/')}`
              : 'Vault not linked — open path in notes panel'
            : 'Desktop app required for disk sync'}
          </span>
        </div>
        <ObsidianNeuralGraph
          key={graphKey}
          notes={notes}
          selectedPath={selectedPath}
          onSelectPath={selectPath}
        />
      </div>

      {/* Bottom 1/4 (25%): Notes 50% | System/content 50% — handled inside ObsidianMemoryPanel */}
      <div
        className="min-h-0 overflow-hidden"
        style={{
          flex: '1 1 0%',
          height: '25%',
          maxHeight: '25%',
        }}
      >
        <ObsidianMemoryPanel
          externalSelectedPath={selectedPath}
          onNotesChanged={(list) => {
            setNotes(list);
          }}
          onSelectPath={selectPath}
        />
      </div>
    </motion.div>
  );
}
