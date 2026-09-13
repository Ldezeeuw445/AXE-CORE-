/**
 * Een desktopvenster (1280×800), geen tweede AXE-schil. Alleen de balk met
 * verkeerslichten en een adres — daaronder het echte voorbeeld.
 */
import { type ReactNode } from 'react';

export function DeskFrame({
  children, url = 'localhost',
}: {
  children: ReactNode;
  url?: string;
}) {
  return (
    <div className="axe-deskframe">
      <div className="axe-deskframe__balk">
        <span className="axe-deskframe__verkeers" aria-hidden="true"><i /><i /><i /></span>
        <span className="axe-deskframe__url">{url}</span>
      </div>
      <div className="axe-deskframe__scherm">{children}</div>
    </div>
  );
}
