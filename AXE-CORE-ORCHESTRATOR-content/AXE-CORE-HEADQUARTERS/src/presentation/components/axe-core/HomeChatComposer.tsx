import type { ReactNode } from 'react';

/**
 * De balk waarin je typt, onder de chatplaat.
 *
 * Draagt `axe-composer`, dezelfde haak als de onderbalk van de app, zodat de
 * plaat-stijl (design/axe-look.css) hem als één pil opmaakt met dezelfde
 * breedte als de chatplaat erboven en de navigatie eronder. In de demo is dat
 * één van de drie dingen die het onderste blok maken; drie verschillende
 * breedtes lazen als een fout.
 *
 * De lijn erboven is weg: de plaat en de composer zijn twee losse vlakken met
 * ruimte ertussen, en een streep ertussen maakt er weer één venster van.
 */
export function HomeChatComposer({ children }: { children: ReactNode }) {
  return (
    <div className="axe-composer px-2.5 py-2.5 flex-shrink-0">
      <div className="axe-gemini-shell">
        <div className="axe-gemini-inner gap-1.5">
          {children}
        </div>
      </div>
    </div>
  );
}
