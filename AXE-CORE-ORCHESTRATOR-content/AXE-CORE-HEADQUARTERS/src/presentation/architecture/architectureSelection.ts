import type { ArchitectureNode } from '@/domain/architecture/architectureGraph';

const ARCHITECTURE_SELECT_EVENT = 'axe-architecture-select';

export function emitArchitectureSelection(node: ArchitectureNode | null): void {
  window.dispatchEvent(new CustomEvent(ARCHITECTURE_SELECT_EVENT, { detail: node }));
}

export function onArchitectureSelection(handler: (node: ArchitectureNode | null) => void): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<ArchitectureNode | null>).detail ?? null);
  };
  window.addEventListener(ARCHITECTURE_SELECT_EVENT, listener);
  return () => window.removeEventListener(ARCHITECTURE_SELECT_EVENT, listener);
}
