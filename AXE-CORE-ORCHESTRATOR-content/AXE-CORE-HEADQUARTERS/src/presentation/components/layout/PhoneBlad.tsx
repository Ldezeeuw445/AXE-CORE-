/**
 * Onderblad op de telefoon — vervangt hover-popovers.
 * Alleen vorm; desktop blijft de bestaande popover gebruiken.
 */
import type { ReactNode } from 'react';

export function PhoneBlad({
  titel,
  onSluit,
  children,
}: {
  titel?: string;
  onSluit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="axe-phone-blad" role="dialog" aria-modal="true" data-axe-phone-blad>
      <button
        type="button"
        className="axe-phone-blad-sluier"
        aria-label="Close"
        onClick={onSluit}
      />
      <div className="axe-phone-blad-plaat">
        <div className="axe-phone-blad-greep" aria-hidden="true" />
        {titel && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{titel}</h2>
            <button
              type="button"
              onClick={onSluit}
              className="axe-phone-tik"
              aria-label="Close"
              style={{ color: 'var(--text-muted)' }}
            >
              Close
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
