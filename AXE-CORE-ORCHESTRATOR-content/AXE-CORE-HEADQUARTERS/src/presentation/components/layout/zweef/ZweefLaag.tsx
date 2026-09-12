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
 * de zwevers erin vangen ze. Hij bestaat in beide looks: de telefoon en de
 * bol horen op de plaat, of die plaat nu gerookt of licht is.
 *
 * En alleen in het bovenste venster. In de telefoon op Home draait dezelfde
 * app in een iframe; daar is de app de inhoud, niet de omgeving, en een
 * telefoon in de telefoon zou de hele app opnieuw laden -- zonder einde. Zie
 * ingebed.ts.
 */
import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { isIngebed } from './ingebed';

export function ZweefLaag({ children }: { children: ReactNode }) {
  const heeftPlaat = useHeeftPlaat();
  if (!heeftPlaat) return null;
  if (typeof document === 'undefined' || isIngebed()) return null;
  return createPortal(<div className="axe-zweeflaag">{children}</div>, document.body);
}
