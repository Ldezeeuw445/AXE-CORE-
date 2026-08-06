import type { ReactNode } from 'react';

/** Gemini-style rainbow edge wrapper for the Home AXE chat input row. */
export function HomeChatComposer({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="axe-gemini-shell">
        <div className="axe-gemini-inner gap-1.5">
          {children}
        </div>
      </div>
    </div>
  );
}
