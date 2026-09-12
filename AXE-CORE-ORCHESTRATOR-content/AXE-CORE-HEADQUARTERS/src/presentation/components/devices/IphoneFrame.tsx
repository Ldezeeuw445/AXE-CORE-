/**
 * Een iPhone 15 Pro op ware grootte (393x852), titanium, met dynamic island en
 * de vier zijknoppen. Wat erin staat is aan de aanroeper; de schaal zit op de
 * omhullende .axe-toestel (--schaal) zodat het scherm zelf op 393px rendert
 * en tekst en lay-out kloppen met een echte telefoon.
 */
import { type ReactNode } from 'react';

export function IphoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`axe-toestel ${className}`.trim()}>
      <div className="axe-iphone">
        <span className="axe-iphone__knop axe-iphone__knop--stil" />
        <span className="axe-iphone__knop axe-iphone__knop--vol1" />
        <span className="axe-iphone__knop axe-iphone__knop--vol2" />
        <span className="axe-iphone__knop axe-iphone__knop--aan" />
        <div className="axe-iphone__scherm">
          <div className="axe-iphone__eiland" />
          {children}
        </div>
      </div>
    </div>
  );
}
