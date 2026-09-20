/**
 * Materiaal van het Android-slot. Alleen hier: de Mac houdt native glas.
 *
 * Zwart: matzwart zwevend frost. Licht: dezelfde blokken, grijzer frost,
 * geen wit vlak.
 */
import type { CSSProperties } from 'react';
import type { Look } from '@/domain/look';

export type LockMateriaal = {
  kaart: CSSProperties;
  binnen: CSSProperties;
  tekst: string;
  gedempt: string;
};

export function lockMateriaal(look: Look): LockMateriaal {
  if (look === 'glass') {
    return {
      kaart: {
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 28%), rgba(96, 102, 112, 0.36)',
        backdropFilter: 'blur(22px) saturate(140%)',
        WebkitBackdropFilter: 'blur(22px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.22)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.26) inset, 0 14px 32px rgba(24, 28, 36, 0.16)',
      },
      binnen: {
        background: 'rgba(78, 84, 94, 0.28)',
        border: '1px solid rgba(255,255,255,0.16)',
      },
      tekst: 'rgba(18, 22, 28, 0.92)',
      gedempt: 'rgba(18, 22, 28, 0.52)',
    };
  }
  return {
    kaart: {
      background:
        'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 24%), rgba(8, 9, 12, 0.62)',
      backdropFilter: 'blur(22px) saturate(140%)',
      WebkitBackdropFilter: 'blur(22px) saturate(140%)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 16px 40px rgba(0,0,0,0.35)',
    },
    binnen: {
      background: 'rgba(0, 0, 0, 0.32)',
      border: '1px solid rgba(255,255,255,0.06)',
    },
    tekst: 'var(--text-primary)',
    gedempt: 'var(--text-muted)',
  };
}
