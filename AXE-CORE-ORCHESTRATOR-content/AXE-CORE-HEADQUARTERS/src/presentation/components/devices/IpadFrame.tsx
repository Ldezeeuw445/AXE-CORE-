/**
 * iPad Pro 11 op ware grootte (820×1180). Schaal zit op de omhullende
 * .axe-toestel (--schaal), net als bij de iPhone — het scherm zelf rendert
 * op 820px zodat de lay-out klopt met een echte tablet.
 */
import { type ReactNode } from 'react';

export function IpadFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`axe-toestel ${className}`.trim()}>
      <div className="axe-ipad">
        <span className="axe-ipad__camera" />
        <div className="axe-ipad__scherm">{children}</div>
      </div>
    </div>
  );
}
