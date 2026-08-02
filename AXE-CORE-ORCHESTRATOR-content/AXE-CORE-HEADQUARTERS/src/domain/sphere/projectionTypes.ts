/**
 * Sphere Living Display — domain contracts only.
 *
 * Design rule: Presentation never owns data. It only renders it.
 *
 * Flow: Memory → Router → Workspace → Projection → Sphere
 * Never: Sphere → Memory → Files → Tools
 */

export type SpherePhase = 'idle' | 'opening' | 'projecting' | 'closing';

export type ProjectionMode =
  | 'none'
  | 'document'
  | 'image'
  | 'chart'
  | 'map'
  | 'code'
  | 'media';

export type ProjectionSource = 'chat' | 'drop' | 'tool' | 'user' | 'director';

/** Immutable view-model handed to the sphere. No fetchers, no file handles. */
export interface ProjectionPayload {
  mode: ProjectionMode;
  title: string;
  subtitle?: string;
  /** Plain text body for document/code modes. */
  text?: string;
  /** data-URL or remote URL for image/media. */
  mediaUrl?: string;
  mime?: string;
  /** Optional structured data (chart series, map bounds) — already resolved upstream. */
  data?: Record<string, unknown>;
  source: ProjectionSource;
  /** Correlation id for dismiss / logging. */
  id: string;
  createdAt: number;
}

export interface SphereMood {
  /** Accent tint hint for particle/core while projecting. */
  accent: 'cyan' | 'gold' | 'violet' | 'soft' | 'default';
  energy: 'calm' | 'pulse' | 'focus' | 'idle';
}

export function moodForMode(mode: ProjectionMode): SphereMood {
  switch (mode) {
    case 'document':
    case 'code':
      return { accent: 'cyan', energy: 'calm' };
    case 'image':
    case 'media':
      return { accent: 'soft', energy: 'focus' };
    case 'chart':
      return { accent: 'gold', energy: 'pulse' };
    case 'map':
      return { accent: 'violet', energy: 'focus' };
    default:
      return { accent: 'default', energy: 'idle' };
  }
}
