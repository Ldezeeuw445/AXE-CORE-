/**
 * De laag waarin zwevers leven.
 *
 * Hij hangt via een portal aan document.body, niet in de shell. De shell heeft
 * in black een backdrop-filter, en dat maakt hem tot containing block voor
 * alles wat `position: fixed` is: een zwever erin zou meeschuiven met de
 * shell in plaats van met het venster. Buiten de shell klemt hij netjes aan
 * het venster.
 *
 * De laag zelf laat aanrakingen door (pointer-events: none in de css); alleen
 * de zwevers erin vangen ze. Hij bestaat alleen in black: de ruit en de
 * zwevers zijn onderdeel van het toekomstontwerp, en glass blijft zoals hij is.
 *
 * En alleen in het bovenste venster. In de telefoon op Home draait dezelfde
 * app in een iframe; daar is de app de inhoud, niet de omgeving, en een
 * telefoon in de telefoon zou de hele app opnieuw laden -- zonder einde. Zie
 * ingebed.ts.
 */
import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHeeftPlaat, useIsGlassLook } from '@/presentation/components/axe-core/sceneBackdrop';
import { isIngebed } from './ingebed';

export function ZweefLaag({ children }: { children: ReactNode }) {
  const heeftPlaat = useHeeftPlaat();
  const glass = useIsGlassLook();
  if (!heeftPlaat || glass) return null;
  if (typeof document === 'undefined' || isIngebed()) return null;
  return createPortal(<div className="axe-zweeflaag">{children}</div>, document.body);
}
