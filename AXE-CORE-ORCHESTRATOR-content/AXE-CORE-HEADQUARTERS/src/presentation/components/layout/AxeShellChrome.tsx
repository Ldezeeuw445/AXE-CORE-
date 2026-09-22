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
import { useEffect, useRef } from 'react';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';
import { SLOT_ID } from '@/presentation/components/layout/PlaatSlots';

/** Binnen deze afstand van de rand gaat een rail open. */
const ZONE = 34;
/** Tot deze afstand blijft hij open. Het verschil is met opzet: op dezelfde
 *  grens sluiten laat de rail flikkeren bij de kleinste trilling van je hand. */
const BREEDTE = 302 + 40;

export function AxeShellChrome() {
  const coreView = useCoreViewStore(s => s.coreView);

  /* Corrective round 5, Fix 1: `meetHoogte`/`meetMidden` leven in de
     mount-effect hieronder (deps `[]`) en zijn dus alleen als closure
     bereikbaar. De tab-wissel-effect verderop moet DEZELFDE functies kunnen
     aanroepen -- niet een kopie -- anders meet hij met verouderde
     querySelector-resultaten uit het allereerste render. Refs geven dat
     tweede effect een stabiele handle naar de actuele functies zonder de
     mount-effect zelf te herstarten bij elke tab-wissel. */
  const meetHoogteRef = useRef<() => void>(() => {});
  const meetMiddenRef = useRef<() => void>(() => {});

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

        /* De hoogte van het vak waarin de bol zweeft -- gemeten toen de
           chatplaat OPEN stond.
           Klap je de plaat in, dan schuift --axe-chat-top omlaag en zou de bol
           meezakken. Dat is precies wat niet mag: hij hoort op zijn plek te
           blijven, of de chat nu open is of niet. Een ingeklapte plaat is
           alleen zijn kopregel (~40px), dus daar herken je hem aan.
           Blijft de laatste openstand staan tot het venster van maat verandert
           -- dan meet de eerstvolgende opening hem opnieuw. */
        const OPEN_VANAF = 80;
        if (r.height > OPEN_VANAF) {
          const hoofd = document.querySelector('main');
          const top = hoofd ? hoofd.getBoundingClientRect().top : 0;
          /* De bol staat gecentreerd in dit vak, dus het vak iets korter maken
             tilt hem op. Gevraagd op 16 september: meer lucht tussen de core en
             de composer -- ze stonden zo dicht op elkaar dat de bol op de plaat
             leek te rusten in plaats van erboven te zweven. */
          const ADEM = 56;
          const vak = Math.max(0, Math.round(r.top - top) - ADEM);
          if (vak > 0) wortel.style.setProperty('--axe-bol-vak', `${vak}px`);
        }
        wortel.style.setProperty('--axe-chat-hoog', `${Math.round(r.height)}px`);

        /* Hoeveel er van onderaf VRIJ moet blijven om boven de chatplaat te
           eindigen. Voor de kolommen naast het beeld (Neural, Terrain,
           Architecture).

           Als bodem-inzet en niet als hoogte, want dat is wat `bottom` in css
           wil -- en het is precies dezelfde vorm als --axe-rail-onder hierboven,
           dat het voor de voetbalk doet.

           Dit ontbrak, en ik greep toen naar --axe-lucht in de veronderstelling
           dat dat "de lucht onder de kopbalk" was. Dat is het niet: het is de
           BOVENKANT VAN DE VOET (hier 810 van 1000). De kolommen begonnen dus
           op 810 en eindigden op 762 -- nul hoog, en hun inhoud werd honderden
           pixels buiten beeld getekend. Vandaar een eigen, gemeten maat. */
        wortel.style.setProperty('--axe-chat-onder', `${Math.max(0, Math.round(window.innerHeight - r.top + 14))}px`);
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
        wortel.style.setProperty('--axe-composer-hoog', `${Math.round(r.height)}px`);
      }

      /* De hoogte van het INVOERVAK alleen, los van de kolom eromheen.
         De composer-kolom draagt ook de snelactie-pillen eronder, dus
         --axe-composer-hoog is inmiddels veel meer dan het vak zelf. De
         paneel-composers (terminal, code-agent) hangen hun hoogte hieraan op
         omdat ze naast dat VAK horen te staan; op de kolom meeschalen maakte
         ze bijna twee keer zo hoog. */
      const vak = document.querySelector('.axe-vak');
      if (vak) {
        wortel.style.setProperty('--axe-vak-hoog', `${Math.round(vak.getBoundingClientRect().height)}px`);
      }

      /* Corrective round 4, Fix D: hoe hoog het geheugendok (MemoryDock) op
       * dit moment werkelijk is -- leeg (geen route gebruikt hem, of het
       * slot staat op `:empty { display:none }`) is dat 0, dichtgeklapt is
       * het de koprij, opengeklapt de koprij plus de kolommen.
       *
       * Dit bestond niet toen `.axe-slot--hoog.axe-slot--links/rechts` en
       * `.axe-shell aside` hun `bottom`-formule kregen (round 2): die stopt
       * op --axe-chat-top, de bovenkant van de chatplaat, en weet niets van
       * een dok dat DAARBOVEN hangt. Met deze maat kunnen beide formules
       * zichzelf corrigeren zonder dat het dok ooit met naam genoemd hoeft
       * te worden op de plek waar ze staan. */
      const dok = document.getElementById('axe-slot-dock');
      wortel.style.setProperty('--axe-dock-hoog', `${dok ? Math.round(dok.getBoundingClientRect().height) : 0}px`);
    };
    meetHoogteRef.current = meetHoogte;

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

      /* Corrective round 4, Fix B: waar de balk zelf ophoudt, zodat Neural en
       * Terrain's eigen "Search memories..."-composer daar ONDER kan
       * beginnen. Stond hardcoded op top:56px in allebei se eigen css --
       * geraden, en 1-4px te weinig zodra de balk zijn volle hoogte pakt (5px
       * buitenpadding + een knop van 7px padding rond een 13px icoon = ~41px
       * vanaf top:16px, dus rond de 57px). Gemeten in plaats van geraden
       * betekent ook dat dit blijft kloppen als de balk ooit van hoogte
       * verandert (Awareness-label weg op mobiel, een vijfde weergave, etc). */
      const onder = midden ? Math.ceil(midden.getBoundingClientRect().bottom) + 8 : 64;
      wortel.style.setProperty('--axe-viewctl-onder', `${onder}px`);
    };
    meetMiddenRef.current = meetMidden;

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
      /* Het vak groeit mee met wat je typt, en dan horen de panelen ernaast
         mee te groeien. Zonder deze observer blijven ze op de hoogte van het
         eerste frame staan. */
      const vak = document.querySelector('.axe-vak');
      if (vak) obs.observe(vak);
      /* Het dok wisselt van hoogte puur door dicht/open te klikken -- geen van
         de andere gemeten elementen verandert daarbij mee, dus zonder een
         eigen observer hier zou --axe-dock-hoog alleen bijwerken bij een
         window-resize. */
      const dok = document.getElementById('axe-slot-dock');
      if (dok) obs.observe(dok);
    }

    /* Corrective round 6, Part 3: Neural's tab-switch race was still not
     * fixed by the timed retries in the tab-switch effect below -- Terrain
     * is fine, Neural still reverts. The reason is knowable, not random:
     * Neural's sidebar content is not always present when this component
     * measures -- `useSlotAdoptie` (PlaatSlots.tsx) only `appendChild`s the
     * real `#sidebar-left`/`#sidebar-right` DOM into `#axe-slot-links`/
     * `#axe-slot-rechts` after `countsReady` (NeuralBrain.tsx: `stats.total >
     * 0`, a Supabase-backed fetch) makes the scene-build effect run at all.
     * That fetch can take longer than the fixed rAF/150ms/300ms window below,
     * especially right after a tab switch -- so those retries can all fire
     * BEFORE adoption happens, and nothing re-measures once it finally does.
     * Terrain never hits this: its columns are plain React portals
     * (PlaatSlot), present on the very first render, no fetch-gated adoption
     * involved.
     *
     * The adoption itself IS the precise, deterministic signal: it is a
     * `childList` mutation on the slot host (`gastheer.appendChild(el)`).
     * Watching the three slot hosts directly for exactly that mutation means
     * this re-measures the instant content actually lands (or leaves) --
     * `useSlotAdoptie`'s cleanup does `ouder.insertBefore(el, naast)`, which
     * is also a `childList` change on the host it removes `el` FROM, so
     * leaving a tab re-measures too, not just arriving on one. No guessing at
     * a number that has to cover an unbounded network fetch. */
    let slotAdoptieObs: MutationObserver | null = null;
    if ('MutationObserver' in window) {
      slotAdoptieObs = new MutationObserver(() => { meetHoogte(); meetMidden(); });
    }
    const geobserveerdeSloten = new Set<string>();
    const volgSlotAdoptie = () => {
      if (!slotAdoptieObs) return;
      for (const naam of ['links', 'rechts', 'dock'] as const) {
        if (geobserveerdeSloten.has(naam)) continue;
        const host = document.getElementById(SLOT_ID[naam]);
        if (host) {
          slotAdoptieObs.observe(host, { childList: true });
          geobserveerdeSloten.add(naam);
        }
      }
    };

    /* De view-knoppen komen en gaan met de pagina, dus kijken we naar de DOM
       zelf en niet alleen naar hun maat: op een tab zonder die knoppen moet de
       gereserveerde ruimte terug naar nul, anders staat de klok scheef. */
    let middenObs: ResizeObserver | null = null;
    let domObs: MutationObserver | null = null;
    let dokGevonden = false;
    const volgMidden = () => {
      meetMidden();
      middenObs?.disconnect();
      if (midden && 'ResizeObserver' in window) {
        middenObs = new ResizeObserver(meetMidden);
        middenObs.observe(midden);
      }
      /* Het dok-slot bestaat pas zodra PlaatSlotHosts mount (na opPlaat), wat
         later kan zijn dan dit effect. Zodra de bodymutatie hem alsnog laat
         zien, alsnog opnemen in de hoogte-observer hierboven en meteen een
         keer meten -- anders blijft --axe-dock-hoog op 0 staan op de eerste
         tab die het dok daadwerkelijk gebruikt. */
      if (!dokGevonden) {
        const dok = document.getElementById('axe-slot-dock');
        if (dok) {
          dokGevonden = true;
          obs?.observe(dok);
          meetHoogte();
        }
      }
      /* Zelfde late-binding-probleem als het dok hierboven, nu voor de drie
         adoptie-gastheren: ze bestaan pas na PlaatSlotHosts, dus dezelfde
         bodymutatie die dokGevonden bijwerkt, probeert ook deze opnieuw. */
      volgSlotAdoptie();
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
      slotAdoptieObs?.disconnect();
      for (const naam of ['--axe-chat-top', '--axe-chat-hoog', '--axe-chat-onder', '--axe-chat-links', '--axe-chat-rechts', '--axe-composer-onder', '--axe-composer-hoog', '--axe-vak-hoog', '--axe-dock-hoog']) {
        wortel.style.removeProperty(naam);
      }
      domObs?.disconnect();
      wortel.style.removeProperty('--axe-viewctl-b');
      wortel.style.removeProperty('--axe-viewctl-onder');
      delete wortel.dataset.railL;
      delete wortel.dataset.railR;
    };
  }, []);

  /* Corrective round 5, Fix 1: "Neural was correct voor een moment, toen
     Terrain ook, toen sprongen beide terug" -- de meet-effect hierboven is
     puur REACTIEF: hij hermeet pas als een geobserveerd element (`voet`,
     `.axe-chatplaat`, `.axe-composer`, `.axe-vak`, `#axe-slot-dock`) zelf van
     MAAT verandert, of het venster resized. Een tab-wissel doet geen van
     beide betrouwbaar: Neural en Terrain adopteren hun zijbalk-inhoud in
     dezelfde gastheer-elementen (`#axe-slot-links/rechts/dock`, zie
     `useSlotAdoptie` in PlaatSlots.tsx) via hun EIGEN `requestAnimationFrame`
     -- de knop klikken, React commit de nieuwe boom, en pas een frame later
     verplaatst die hook de content erin. Een size-observer op de gastheer
     kan die overgang oppikken op een moment dat de inhoud half verplaatst is
     (tijdelijk correcte tussenmaat), en daarna niets triggert een verse
     meting zodra alles echt stil ligt -- vandaar "goed voor een moment, dan
     terug".

     Omdat de volgorde tussen ONZE eigen rAF hieronder en de rAF van
     `useSlotAdoptie` niet gegarandeerd is (beide worden in dezelfde
     effect-flush ingepland; welke component eerder in de boom staat bepaalt
     wie eerder plant, niet wie eerder klaar is), meet dit effect niet één
     keer opnieuw maar een paar keer over een kort venster: meteen (voor de
     snelste gevallen), op de eerstvolgende rAF (vangt de adoptie als die in
     dezelfde frame klaar is), en dan nog twee keer via setTimeout (150ms en
     300ms) als achtervang voor tragere adoptie of een tussenliggende
     animatie. Dat laatste stel garandeert een verse, sluitende meting ruim
     binnen wat als een klap aanvoelt, ongeacht de exacte rAF-volgorde --
     zonder de precieze async-veroorzaker te hoeven vastpinnen.

     Additief: de ResizeObservers/MutationObserver hierboven blijven gewoon
     bestaan als vangnet voor alle andere gevallen (typen, venster-resize,
     dok open/dicht). Dit effect vervangt niets, het voegt alleen de
     tab-wissel toe als vierde trigger naast maat, resize en DOM-mutatie.

     Corrective round 6, Part 3: dit vaste venster (meteen, rAF, 150ms, 300ms)
     loste Terrain op maar NIET Neural -- Neural's eigen scene-build-effect
     wacht zelf op `countsReady` (NeuralBrain.tsx: `stats.total > 0`, een
     Supabase-fetch) voor hij draait, en pas ALS hij draait roept hij
     `useSlotAdoptie` aan die de zijbalk-inhoud verhuist. Die fetch kan
     langer duren dan 300ms, zeker vlak na een tab-wissel -- dan vuren alle
     vier de pogingen hierboven voordat de adoptie ooit gebeurd is, en daarna
     triggert niets nog een verse meting. Terrain heeft dit probleem niet:
     zijn kolommen zijn gewone React-portals (PlaatSlot), aanwezig vanaf de
     eerste render, geen fetch-gate ertussen.

     De oplossing staat niet hier maar in de mount-effect hierboven
     (`slotAdoptieObs`): een MutationObserver op de drie sloot-gastheren zelf
     (`#axe-slot-links/-rechts/-dock`) die precies vuurt op de `childList`-
     mutatie die `appendChild`/`insertBefore` daadwerkelijk is -- het exacte,
     deterministische moment waarop inhoud verschijnt of vertrekt, ongeacht
     hoelang de fetch duurde. Dit effect (de vaste tijdvensters) blijft
     ernaast bestaan als extra vangnet -- goedkoop, en Terrain profiteert er
     toch al van -- maar de DOM-mutatie is nu de trigger die Neural's trage,
     data-afhankelijke geval daadwerkelijk garandeert. */
  useEffect(() => {
    const opnieuwMeten = () => {
      meetHoogteRef.current();
      meetMiddenRef.current();
    };
    opnieuwMeten();
    const raf = requestAnimationFrame(opnieuwMeten);
    const t1 = window.setTimeout(opnieuwMeten, 150);
    const t2 = window.setTimeout(opnieuwMeten, 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [coreView]);

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
