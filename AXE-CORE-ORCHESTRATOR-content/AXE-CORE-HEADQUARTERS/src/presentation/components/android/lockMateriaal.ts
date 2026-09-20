/**
 * Inkt op de slotPLAAT. De kaarten zelf zijn --kaart (axe-look.css).
 * Licht: donkere letters op grijs frost. Zwart: --ink op gerookt glas.
 */
import type { Look } from '@/domain/look';

export type LockMateriaal = {
  tekst: string;
  gedempt: string;
};

export function lockMateriaal(look: Look): LockMateriaal {
  if (look === 'glass') {
    return {
      tekst: 'rgba(18, 22, 28, 0.92)',
      gedempt: 'rgba(18, 22, 28, 0.52)',
    };
  }
  return {
    tekst: 'var(--text-primary)',
    gedempt: 'var(--text-muted)',
  };
}
