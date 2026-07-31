/**
 * sphereProjectionStore — presentation view-state only.
 * Holds the current ProjectionPayload (already resolved upstream).
 * Does not load files, call APIs, or own memory.
 */
import { create } from 'zustand';
import type { ProjectionPayload, SpherePhase } from '@/domain/sphere/projectionTypes';
import { moodForMode } from '@/domain/sphere/projectionTypes';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';

interface SphereProjectionState {
  phase: SpherePhase;
  payload: ProjectionPayload | null;
  /** Request a projection (from director / workspace). */
  project: (payload: ProjectionPayload) => void;
  /** Begin close animation then clear. */
  dismiss: () => void;
  /** Called by SphereStage when open animation finishes. */
  markProjecting: () => void;
  /** Called by SphereStage when close animation finishes. */
  markIdle: () => void;
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;

export const useSphereProjectionStore = create<SphereProjectionState>((set, get) => ({
  phase: 'idle',
  payload: null,

  project: (payload) => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    set({ phase: 'opening', payload });
    emitAxeEvent('axe:sphere-project' as never, payload as never);
    // Auto-advance to projecting if stage doesn't
    setTimeout(() => {
      if (get().phase === 'opening' && get().payload?.id === payload.id) {
        set({ phase: 'projecting' });
      }
    }, 420);
  },

  dismiss: () => {
    if (get().phase === 'idle' && !get().payload) return;
    set({ phase: 'closing' });
    emitAxeEvent('axe:sphere-dismiss' as never, {} as never);
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      set({ phase: 'idle', payload: null });
      closeTimer = null;
    }, 380);
  },

  markProjecting: () => {
    if (get().phase === 'opening') set({ phase: 'projecting' });
  },

  markIdle: () => set({ phase: 'idle', payload: null }),
}));

export function selectSphereMood() {
  const { payload, phase } = useSphereProjectionStore.getState();
  if (!payload || phase === 'idle' || phase === 'closing') return moodForMode('none');
  return moodForMode(payload.mode);
}
