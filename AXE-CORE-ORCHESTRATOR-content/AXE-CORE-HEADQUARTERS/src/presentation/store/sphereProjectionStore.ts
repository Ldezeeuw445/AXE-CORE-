/**
 * sphereProjectionStore — presentation view-state only.
 * Queue holds up to 3 payloads; active is rendered by SphereStage.
 *
 * Note: do NOT have SphereStage subscribe to axe:sphere-project and call
 * project() again — that creates a re-entry loop. External tools may still
 * emit axe:sphere-project; SphereStage listens once and applies if idle/different.
 */
import { create } from 'zustand';
import type { ProjectionPayload, SpherePhase } from '@/domain/sphere/projectionTypes';
import { moodForMode } from '@/domain/sphere/projectionTypes';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';

const MAX_QUEUE = 3;

interface SphereProjectionState {
  phase: SpherePhase;
  payload: ProjectionPayload | null;
  queue: ProjectionPayload[];
  project: (payload: ProjectionPayload) => void;
  focus: (id: string) => void;
  dismiss: () => void;
  dismissAll: () => void;
  markProjecting: () => void;
  markIdle: () => void;
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let lastEmitId: string | null = null;

export const useSphereProjectionStore = create<SphereProjectionState>((set, get) => ({
  phase: 'idle',
  payload: null,
  queue: [],

  project: (payload) => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    const prev = get().queue.filter(q => q.id !== payload.id);
    const queue = [payload, ...prev].slice(0, MAX_QUEUE);
    set({ phase: 'opening', payload, queue });

    // Emit only once per payload id (avoid SphereStage re-entry storms)
    if (lastEmitId !== payload.id) {
      lastEmitId = payload.id;
      emitAxeEvent('axe:sphere-project', payload);
    }

    setTimeout(() => {
      if (get().phase === 'opening' && get().payload?.id === payload.id) {
        set({ phase: 'projecting' });
      }
    }, 380);
  },

  focus: (id) => {
    const item = get().queue.find(q => q.id === id);
    if (!item) return;
    set({ phase: 'opening', payload: item });
    setTimeout(() => {
      if (get().payload?.id === id) set({ phase: 'projecting' });
    }, 280);
  },

  dismiss: () => {
    if (get().phase === 'idle' && !get().payload) return;
    set({ phase: 'closing' });
    emitAxeEvent('axe:sphere-dismiss', {});
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      const cur = get().payload;
      const queue = get().queue.filter(q => q.id !== cur?.id);
      const next = queue[0] ?? null;
      lastEmitId = null;
      if (next) {
        set({ phase: 'opening', payload: next, queue });
        setTimeout(() => {
          if (get().payload?.id === next.id) set({ phase: 'projecting' });
        }, 280);
      } else {
        set({ phase: 'idle', payload: null, queue: [] });
      }
      closeTimer = null;
    }, 340);
  },

  dismissAll: () => {
    set({ phase: 'closing' });
    emitAxeEvent('axe:sphere-dismiss', { reason: 'all' });
    lastEmitId = null;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      set({ phase: 'idle', payload: null, queue: [] });
      closeTimer = null;
    }, 340);
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
