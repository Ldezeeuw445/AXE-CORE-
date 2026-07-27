/** Standalone Obsidian co-founder memory page (also reachable from Memory). */
import { motion } from 'framer-motion';
import ObsidianMemoryPanel from '@/presentation/components/axe-core/ObsidianMemoryPanel';
import { HUD_BASE_BG } from '@/presentation/styles/hudBackground';

export default function ObsidianMemory() {
  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: HUD_BASE_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex-1 overflow-hidden">
        <ObsidianMemoryPanel />
      </div>
    </motion.div>
  );
}
