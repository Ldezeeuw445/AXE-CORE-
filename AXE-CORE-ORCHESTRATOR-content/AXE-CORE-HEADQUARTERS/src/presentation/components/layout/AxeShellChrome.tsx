/**
 * Het gedrag van de plaat-schil: de rails aan de rand, en de hoogtes die de
 * rest eraan ophangt.
 *
 * De vórm staat in design/axe-look.css. Hier staat alleen wat CSS niet kan:
 * weten waar je muis is, en meten hoe hoog de onderbalk werkelijk is.
 *
 * Doet niets zonder `data-look` op <html> -- zonder de plaat is er geen rand
 * om iets uit te laten komen, en dan hoort de app zich te gedragen zoals hij
 * altijd deed.
 */
import { useEffect } from 'react';

/** Binnen deze afstand van de rand gaat een rail open. */
const ZONE = 34;
/** Tot deze afstand blijft hij open. Het verschil is met opzet: op dezelfde
 *  grens sluiten laat de rail flikkeren bij de kleinste trilling van je hand. */
const BREEDTE = 302 + 40;

export function AxeShellChrome() {
  useEffect(() => {
    const wortel = document.documentElement;

    /* ── De rails ──────────────────────────────────────────────────────── */
    const meetMuis = (x: number) => {
      const w = window.innerWidth;
      wortel.dataset.railL = x <= (wortel.dataset.railL === 'open' ? BREEDTE : ZONE) ? 'open' : 'dicht';
      wortel.dataset.railR = x >= w - (wortel.dataset.railR === 'open' ? BREEDTE : ZONE) ? 'open' : 'dicht';
    };
    const beweeg = (e: PointerEvent) => { if (e.pointerType !== 'touch') meetMuis(e.clientX); };
    const verlaat = () => { wortel.dataset.railL = 'dicht'; wortel.dataset.railR = 'dicht'; };

    /* Op een aanraakscherm bestaat "muis aan de rand" niet, dus daar reageert
       hij op een veeg vanaf de zijkant. */
    let start: number | null = null;
    const raakAan = (e: TouchEvent) => { start = e.touches[0]?.clientX ?? null; };
    const raakBeweeg = (e: TouchEvent) => {
      if (start === null) return;
      const x = e.touches[0]?.clientX ?? 0, w = window.innerWidth;
      if (start < ZONE && x > start + 20) wortel.dataset.railL = 'open';
      if (start > w - ZONE && x < start - 20) wortel.dataset.railR = 'open';
      if (x > BREEDTE && x < w - BREEDTE) verlaat();
    };
    const raakLos = () => { start = null; };

    /* ── De hoogtes ────────────────────────────────────────────────────────
       De rails en de sterrenlucht stoppen boven de onderste chroom. Die hoogte
       is niet te berekenen: de composer groeit mee met wat erin staat, en de
       navigatie schaalt met het venster. Meten is het enige dat klopt, en een
       ResizeObserver vangt ook de veranderingen die zonder resize gebeuren. */
    const voet = document.querySelector('.axe-shell footer');
    const meetHoogte = () => {
      const boven = voet ? voet.getBoundingClientRect().top : window.innerHeight - 190;
      wortel.style.setProperty('--axe-rail-onder', `${Math.max(0, Math.round(window.innerHeight - boven + 14))}px`);
      wortel.style.setProperty('--axe-lucht', `${Math.max(0, Math.round(boven))}px`);

      /* De maten van de chatplaat, zodat de tab-panelen ernaast kunnen staan
         in plaats van als kolommen langs de rand.
         Meten en niet rekenen: de plaat klapt in en uit, groeit mee met het
         venster en heeft een plafond -- die hoogte is nergens als getal af te
         leiden, alleen af te lezen. */
      const plaat = document.querySelector('.axe-chatplaat');
      if (plaat) {
        const r = plaat.getBoundingClientRect();
        wortel.style.setProperty('--axe-chat-top', `${Math.round(r.top)}px`);
        wortel.style.setProperty('--axe-chat-hoog', `${Math.round(r.height)}px`);
        wortel.style.setProperty('--axe-chat-links', `${Math.round(r.left)}px`);
        wortel.style.setProperty('--axe-chat-rechts', `${Math.round(window.innerWidth - r.right)}px`);
      }

      /* De onderkant van de composer. De panelen naast de chat lopen daar tot
         aan door -- de hele onderste band eindigt op één lijn, anders steekt de
         composer eruit en lijkt het weer los van elkaar te staan. */
      const comp = document.querySelector('.axe-composer');
      if (comp) {
        const r = comp.getBoundingClientRect();
        wortel.style.setProperty('--axe-composer-onder', `${Math.max(0, Math.round(window.innerHeight - r.bottom))}px`);
      }
    };

    /* ── De breedte van de view-knoppen ──────────────────────────────────
       Ze staan fixed in het midden, dus de kopbalk weet niet dat ze bestaan.
       Meten is het enige dat klopt: hun breedte hangt af van de labels, de
       vensterbreedte en of Awareness aan staat. Het blokje in TopNav gebruikt
       deze waarde om precies zoveel ruimte vrij te houden. */
    let midden: Element | null = null;
    const meetMidden = () => {
      midden = document.querySelector('.axe-viewctl');
      const b = midden ? Math.ceil(midden.getBoundingClientRect().width) + 24 : 0;
      wortel.style.setProperty('--axe-viewctl-b', `${b}px`);
    };

    meetMuis(window.innerWidth / 2);
    meetHoogte();
    meetMidden();

    window.addEventListener('pointermove', beweeg, { passive: true });
    window.addEventListener('pointerleave', verlaat);
    window.addEventListener('touchstart', raakAan, { passive: true });
    window.addEventListener('touchmove', raakBeweeg, { passive: true });
    window.addEventListener('touchend', raakLos, { passive: true });
    window.addEventListener('resize', meetHoogte);

    let obs: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      obs = new ResizeObserver(meetHoogte);
      if (voet) obs.observe(voet);
      /* Ook de chatplaat zelf: die verandert van hoogte als je hem in- of
         uitklapt, en dan moeten de panelen ernaast meebewegen. */
      const plaat = document.querySelector('.axe-chatplaat');
      if (plaat) obs.observe(plaat);
      const comp = document.querySelector('.axe-composer');
      if (comp) obs.observe(comp);
    }

    /* De view-knoppen komen en gaan met de pagina, dus kijken we naar de DOM
       zelf en niet alleen naar hun maat: op een tab zonder die knoppen moet de
       gereserveerde ruimte terug naar nul, anders staat de klok scheef. */
    let middenObs: ResizeObserver | null = null;
    let domObs: MutationObserver | null = null;
    const volgMidden = () => {
      meetMidden();
      middenObs?.disconnect();
      if (midden && 'ResizeObserver' in window) {
        middenObs = new ResizeObserver(meetMidden);
        middenObs.observe(midden);
      }
    };
    volgMidden();
    if ('MutationObserver' in window) {
      domObs = new MutationObserver(volgMidden);
      domObs.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('resize', meetMidden);

    return () => {
      window.removeEventListener('pointermove', beweeg);
      window.removeEventListener('pointerleave', verlaat);
      window.removeEventListener('touchstart', raakAan);
      window.removeEventListener('touchmove', raakBeweeg);
      window.removeEventListener('touchend', raakLos);
      window.removeEventListener('resize', meetHoogte);
      window.removeEventListener('resize', meetMidden);
      obs?.disconnect();
      middenObs?.disconnect();
      for (const naam of ['--axe-chat-top', '--axe-chat-hoog', '--axe-chat-links', '--axe-chat-rechts', '--axe-composer-onder']) {
        wortel.style.removeProperty(naam);
      }
      domObs?.disconnect();
      wortel.style.removeProperty('--axe-viewctl-b');
      delete wortel.dataset.railL;
      delete wortel.dataset.railR;
    };
  }, []);

  return (
    <>
      {/* De sleepstrip. data-tauri-drag-region maakt hem tot venstergreep;
          in de browser is het gewoon een leeg strookje. */}
      <div className="axe-sleepstrip" data-tauri-drag-region aria-hidden="true" />
      <div className="axe-railhint axe-railhint--l" aria-hidden="true" />
      <div className="axe-railhint axe-railhint--r" aria-hidden="true" />
    </>
  );
}
