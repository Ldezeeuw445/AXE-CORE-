/**
 * AXE Presence — the compact, persistent AXE that follows every workspace.
 *
 * Home keeps its full Core Sphere. This is not a replacement for that scene.
 * The presence owns the 64px idle orb (centred over the "AXE" label in the
 * bottom nav, so the word sits inside the orb) and the 64px active card (beside the composer)
 * with the latest exchange and activity flight. It lives in shell chrome, so
 * workspaces (NorthSea map, browser, charts, editors) never have to host an
 * AXE overlay of their own.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { ACTIVITEIT_GEBEURTENIS, type AxeActiviteit } from '@/shared/axeActiviteit';
import { kiesDoel, type Rechthoek } from '@/domain/bolVlucht';
import { BolVlucht, type Vlucht } from '@/presentation/components/layout/zweef/BolVlucht';
import { SLOT_ID } from '@/presentation/components/layout/PlaatSlots';

function vindDoel(doel: string): Rechthoek | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-axe-doel="${CSS.escape(doel)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, b: r.width, h: r.height };
  }
  return null;
}

/** Any right-hand rail that is actually visible right now (hover-open, not the
 *  off-screen-by-default state axe-look.css gives every [data-rail='right']
 *  element) -- its own getBoundingClientRect already reflects the CSS
 *  translateX, so an off-screen rail naturally reports an off-screen rect and
 *  never constrains anything here.
 *
 *  Corrective (evaluator round 1, issue 6): `RightPanel.tsx` can now PIN this
 *  rail open (`data-rail-vast='ja'`, see that file and axe-look.css) instead
 *  of only showing it on hover. A pinned rail is on screen ALL the time,
 *  which means it would count as an obstacle on every tab, at every scroll
 *  position -- including the many cases where the rail's own box (it runs
 *  from under the topbar down to roughly the chat plate, see `.axe-shell
 *  aside`'s own top/bottom) never actually reaches down into the composer's
 *  row at all. Measured live at 1920px: exactly that mismatch pushed this
 *  card's ceiling into the composer and put the presence orb on top of the
 *  mic/camera buttons, even though the rail itself stops well above them.
 *
 *  The hover-triggered rail never had this problem: it is only ever visible
 *  for the moment the mouse is at the edge, which is rare and brief enough
 *  that "always treat it as an obstacle while visible" was an acceptable
 *  simplification. A PINNED rail is visible constantly, so the same
 *  simplification needs the one check it was missing -- does this rail's own
 *  box actually reach down far enough to matter -- and only for the pinned
 *  case, since the hover case still wants its previous, safe behaviour. */
function vindZichtbareRechterRail(): Rechthoek | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-rail="right"]')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.right > window.innerWidth + 1) continue;
    if (el.getAttribute('data-rail-vast') === 'ja') {
      const composer = vindDoel('axe-composer');
      // Geen composer gemeten (bijv. eerste render) -- veilig aannemen dat
      // hij wél telt, net als voorheen, in plaats van per ongeluk niets te
      // ontwijken.
      if (composer && r.bottom < composer.y) continue;
    }
    return { x: r.left, y: r.top, b: r.width, h: r.height };
  }
  return null;
}

/** Corrective round 2, Fix 4: Neural's and Terrain's right column (PlaatSlot
 *  `hoog`) is NOT a `[data-rail='right']` -- it is a shell slot that a view
 *  fills and that stays on screen permanently, never hidden/off-screen the
 *  way the hover rail is. This card's ceiling math above only ever checked
 *  the hover rail, so on Neural/Terrain it happily rendered its `vol` (210px)
 *  card straight on top of that always-visible column -- "ABOUT THIS VIEW"
 *  and "MEMORY STREAM LIVE" sitting right where the reader read them getting
 *  a second, unrelated "AXE: ..." exchange painted over them.
 *
 *  This went unnoticed until round 1 fixed the hoog slot's own geometry
 *  (previously it collapsed to zero height and rendered nothing, per the
 *  history in axe-look.css's `.axe-slot--hoog` comment) -- the collision was
 *  always possible, it just had nothing on screen to collide with before.
 *
 *  `.axe-slot:empty { display:none }` already means a hoog slot with no
 *  content reports a zero-size rect here, so this is safe on every other
 *  tab: `getBoundingClientRect()` naturally returns nothing to avoid. */
function vindZichtbareHogeSlotRechts(): Rechthoek | null {
  const el = document.querySelector<HTMLElement>('.axe-slot--rechts.axe-slot--hoog');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.right <= window.innerWidth + 1) return { x: r.left, y: r.top, b: r.width, h: r.height };
  return null;
}

/** Corrective round 8: the ONDERBAND right slot -- `#axe-slot-rechts` in its
 *  plain (non-`--hoog`) form -- is the literal "this tab has side content
 *  next to the composer" case Luka described. `CalendarPage.tsx`,
 *  `Grootboek.tsx`, `CodeEditorPage.tsx` and `NorthseaDesk.tsx` all portal
 *  into it via `<PlaatSlot slot="rechts">` (no `hoog` prop), and axe-look.css
 *  positions that box at `right:14px`, running from the chat plate's own top
 *  down to the composer's bottom (`--axe-chat-top` .. `--axe-composer-onder`)
 *  -- the SAME vertical band this card lives in (`bottom:
 *  --axe-composer-onder`, `height: --axe-composer-hoog`).
 *
 *  `vindZichtbareHogeSlotRechts()` above only matches the OTHER shape of this
 *  same host -- `.axe-slot--rechts.axe-slot--hoog`, Neural/Terrain/
 *  Architecture's full-height column next to the whole scene -- via its
 *  combined class selector. A tab using the plain onderband slot never
 *  satisfied that selector, so it was invisible to every check in
 *  `HORIZONTALE_OBSTAKELS`: the card's 'vol' width (up to `RADIAAL_RESERVE`
 *  from the window edge) painted straight over whatever that tab put there,
 *  exactly the overlap Luka reported.
 *
 *  Measuring the host itself, not a named child -- same move as `vindSlotDok`
 *  below -- so this covers whatever any tab portals in there, present or
 *  future, without ever enumerating pages by name. `.axe-slot:empty {
 *  display:none }` (axe-look.css) already makes an empty host report a zero
 *  rect, so this stays safe on every tab with nothing in that slot. Excludes
 *  the `--hoog` variant explicitly: that one is a different vertical band
 *  (above the chat plate, not beside the composer) and is already its own
 *  obstacle via `vindZichtbareHogeSlotRechts`. */
function vindOnderbandSlotRechts(): Rechthoek | null {
  const el = document.getElementById(SLOT_ID.rechts);
  if (!el || el.classList.contains('axe-slot--hoog')) return null;
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.height > 0 && r.right <= window.innerWidth + 1) return { x: r.left, y: r.top, b: r.width, h: r.height };
  return null;
}

/** Corrective round 6, Part 4: the right radial dock (`RadiaalDok`,
 *  `kant='rechts'`) reserves this same bottom-right corner once its ring
 *  actually fans out to its full 268px-square footprint -- closed, it is a
 *  single 60px button and `RADIAAL_RESERVE` below already covers that rest
 *  position, but open it reaches much further left and would sit right under
 *  a `vol` card without this. Its own box is a FIXED 268px square in the DOM
 *  regardless of open/closed (the ring's `width`/`height` are set inline,
 *  unconditionally; only the tabs inside it transform), so the rect alone
 *  cannot distinguish the two states -- `data-open` can, and that is exactly
 *  what this checks before treating it as an obstacle at all. */
function vindOpenRadiaalRechts(): Rechthoek | null {
  const el = document.querySelector<HTMLElement>('[data-axe-doel="radiaal-rechts"]');
  if (!el || el.getAttribute('data-open') !== 'ja') return null;
  const r = el.getBoundingClientRect();
  if (r.width > 0) return { x: r.left, y: r.top, b: r.width, h: r.height };
  return null;
}

/**
 * Every horizontal obstacle the card's ceiling must stay clear of right now.
 * Each finder returns `null` when it simply isn't in the way this instant
 * (closed, off-screen, absent on this tab) -- `metingActievePositie()` below
 * just takes the tightest (smallest `x`) of whichever ones are actually
 * present.
 *
 * Corrective round 6, Part 4: this used to be three separate named checks
 * bolted directly into `metingActievePositie()`'s own `Math.min()` call, each
 * one added in its own earlier corrective round because nothing generalized
 * "what else is on screen right now" -- the hover rail (round unknown), the
 * always-visible hoog slot (round 2), MemoryDock's height (round 4, a
 * different axis but the same pattern). Luka's ask ("de chat... past zich
 * altijd aan de ruimte die er is aan") is exactly "find every obstacle,
 * don't enumerate them by name" -- this array is that: the next obstacle is
 * one more function pushed here, not a new named variable threaded through
 * `metingActievePositie()`'s body. Kept as a short array and not a bigger
 * registry/plugin system -- that would be solving a problem this file
 * doesn't have yet. */
const HORIZONTALE_OBSTAKELS: Array<() => Rechthoek | null> = [
  vindZichtbareRechterRail,
  vindZichtbareHogeSlotRechts,
  vindOnderbandSlotRechts,
  vindOpenRadiaalRechts,
];

/** Gap kept after the composer's right edge, matching the original design's
 *  own number (the composer used to end exactly 15px before the presence). */
const NA_COMPOSER_GAP = 15;
/** The right radial's closed button sits centred 150px from the window edge
 *  at 60px wide, so its left edge is ~180px in -- measured from RadiaalDok's
 *  own CSS (.axe-dok-knop: 60px, .axe-dok[data-kant='rechts']: right:16px,
 *  vak = (92+42)*2 = 268px), not guessed. A little extra clearance past it. */
const RADIAAL_RESERVE = 190;
const BREEDTE_VOL = 210;
const BREEDTE_COMPACT = 132;
const BREEDTE_MINI = 40;
/** Kept clear above whatever is currently the top of the dock strip -- same
 *  role as NA_COMPOSER_GAP, just on the vertical axis. */
const BOVEN_DOK_GAP = 10;

interface ActievePositie { links: number; modus: 'vol' | 'compact' | 'mini'; breedte: number }

function metingActievePositie(): ActievePositie {
  const composer = vindDoel('axe-composer');
  const obstakel = HORIZONTALE_OBSTAKELS.reduce((dichtstbij, vind) => {
    const r = vind();
    return r ? Math.min(dichtstbij, r.x) : dichtstbij;
  }, Infinity);
  const plafond = Math.min(window.innerWidth - RADIAAL_RESERVE, obstakel);
  const start = (composer ? composer.x + composer.b : window.innerWidth * 0.75) + NA_COMPOSER_GAP;
  const beschikbaar = plafond - start;
  const modus = beschikbaar >= BREEDTE_VOL ? 'vol' : beschikbaar >= BREEDTE_COMPACT ? 'compact' : 'mini';
  const breedte = modus === 'vol' ? BREEDTE_VOL : modus === 'compact' ? BREEDTE_COMPACT : BREEDTE_MINI;
  // Extreme edge case (a very narrow window): hug the ceiling rather than
  // render past it, even if that means sitting closer to the composer than
  // NA_COMPOSER_GAP would otherwise put it.
  const links = Math.min(start, plafond - breedte);
  return { links, modus, breedte };
}

/**
 * Corrective round 7, Fix 1: this used to search for `[data-axe-doel="memory-
 * dock"]` specifically -- the one identity `MemoryDock.tsx` (Neural/Terrain)
 * happens to tag its root with. That only ever matched MemoryDock. NorthSea
 * Desk's `DealsTabel.tsx` sits in the exact same `#axe-slot-dock` host (same
 * `PlaatSlot slot="dock"`, same variable height: closed is one header row,
 * open is more), tagged `data-axe-doel="northsea-deals"` -- a different
 * string this lookup never matched, so the round 4 clamp below silently never
 * applied there and the very "falls underneath the tab bar" overlap round 4
 * fixed for Neural/Terrain was still live, unnoticed, on NorthSea Desk.
 *
 * The actual invariant was never "MemoryDock specifically" -- it is "whatever
 * is currently occupying the dock slot", and that slot's own id
 * (`SLOT_ID.dock`, from PlaatSlots.tsx) is stable and content-agnostic
 * regardless of which page's component got adopted/portaled into it. Measure
 * the HOST directly instead of a named child, so MemoryDock, DealsTabel and
 * anything dropped into this slot in the future are all covered without ever
 * enumerating them by name again -- the same move round 6 already made for
 * `HORIZONTALE_OBSTAKELS`.
 *
 * An empty slot already reports a zero rect here: `.axe-slot:empty {
 * display:none }` (axe-look.css) means `getBoundingClientRect()` naturally
 * returns nothing to avoid, so this stays safe on every tab with no dock
 * content at all.
 */
function vindSlotDok(): Rechthoek | null {
  const el = document.getElementById(SLOT_ID.dock);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, b: r.width, h: r.height };
  return null;
}

/**
 * Corrective round 4, Fix C: the card's own CSS (`bottom: --axe-composer-onder`,
 * `height: --axe-composer-hoog`) pins its box to exactly `.axe-composer`'s own
 * rect -- fine on every tab with nothing in the dock slot. On Neural/Terrain
 * (MemoryDock) and now also NorthSea Desk (DealsTabel), that slot sits
 * directly above this same composer, and its own height is not fixed: closed
 * it is one header row, open it is that row plus more. Nothing here ever
 * measured it, which is exactly the round 2 bug repeating on the other axis --
 * that fix taught this card about the always-visible hoge-slot column so its
 * WIDTH would stop short of it; this teaches it about the dock slot so its
 * HEIGHT does the same.
 *
 * `.axe-slot--dock` and this card are NOT in a stacking conflict -- the slot
 * inherits `.axe-slot`'s z-index:30, the card is z-index:104, comfortably on
 * top. A higher z-index only wins where the two boxes actually overlap,
 * though, and painting the card's own top edge over the dock's stats reads
 * exactly like the "cut-off sliver" Luka saw: the corner of the card sitting
 * on top of the dock, not fully clear of it. So this does not touch z-index
 * -- it stops the boxes from overlapping in the first place by capping the
 * card's rendered height whenever the dock's real, measured bottom edge would
 * otherwise land inside it.
 *
 * Returns `null` when there is no dock content on this tab, or it is not tall
 * enough to reach the card -- the overwhelmingly common case, where the card
 * keeps its full CSS-driven height untouched.
 */
function metingMaxHoogte(): number | null {
  const composer = vindDoel('axe-composer');
  const dok = vindSlotDok();
  if (!composer || !dok) return null;
  const dokOnder = dok.y + dok.h;
  const overschrijding = dokOnder + BOVEN_DOK_GAP - composer.y;
  if (overschrijding <= 0) return null;
  return Math.max(0, composer.h - overschrijding);
}

export function AxePresenceDock() {
  const voice = useVoiceStore();
  const orbRef = useRef<HTMLDivElement | null>(null);
  const [activiteit, setActiviteit] = useState<AxeActiviteit | null>(null);
  const [vlucht, setVlucht] = useState<Vlucht | null>(null);
  const teller = useRef(0);
  const timer = useRef<number | null>(null);

  const laatste = useMemo(() => {
    const berichten = voice.conversation.slice(-8);
    const user = [...berichten].reverse().find(m => m.role === 'user');
    const axe = [...berichten].reverse().find(m => m.role === 'axe');
    return { user, axe };
  }, [voice.conversation]);

  useEffect(() => {
    const opActiviteit = (e: Event) => {
      const a = (e as CustomEvent<AxeActiviteit>).detail;
      const orb = orbRef.current?.getBoundingClientRect();
      if (!a || !orb || document.hidden) return;

      setActiviteit(a);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setActiviteit(null), 3200);

      const puntInBeeld = a.punt
        && a.punt.x >= 0 && a.punt.x <= window.innerWidth
        && a.punt.y >= 0 && a.punt.y <= window.innerHeight;
      const direct = puntInBeeld && a.punt
        ? { rect: { x: a.punt.x - 18, y: a.punt.y - 18, b: 36, h: 36 }, doel: 'punt' }
        : kiesDoel(a.doelen, vindDoel, { b: window.innerWidth, h: window.innerHeight });
      if (!direct) return;

      teller.current += 1;
      setVlucht({
        van: { x: orb.left + orb.width / 2, y: orb.top + orb.height / 2 },
        straal: Math.min(28, orb.width * 0.42),
        rect: direct.rect,
        label: a.label.length > 80 ? `${a.label.slice(0, 77)}…` : a.label,
        kleur: a.kleur ?? '#22d3ee',
        id: teller.current,
      });
    };
    window.addEventListener(ACTIVITEIT_GEBEURTENIS, opActiviteit);
    return () => {
      window.removeEventListener(ACTIVITEIT_GEBEURTENIS, opActiviteit);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const pending = voice.pendingExec;
  const activiteitTekst = activiteit?.label.toLowerCase() ?? '';
  const werk = {
    zoekt: /search|zoek|research|find|scan|onderzoek/.test(activiteitTekst),
    verbindt: /connect|verbind|navigate|open|session|sessie/.test(activiteitTekst),
    schrijft: /write|schrijf|draft|compose|reply|antwoord/.test(activiteitTekst),
  };
  const presenceStatus = activiteit && voice.voiceStatus === 'idle' ? 'processing' as const : undefined;
  /* Luka, 21 sep 2026 (round 5 live review): the "Thinking"/"Working" word
     used to sit in a caption under the particle here too, styled too heavy
     and cramped against the orb. Removed rather than restyled -- the orb's
     own colour/pulse (presenceStatus/werk above) is the state now, and the
     word lives in exactly one place, TopNav's badge, reading the same
     VOICE_STATUS_LABEL so it can never drift from what the particle shows. */
  /* Luka, 21 sep 2026 (live review): resting spot is the middle of the bottom
     nav -- the full 64px orb centred over the AXE word, no card. The moment AXE is actually doing
     something (talking, thinking, waiting on approval), it moves up beside the
     composer and shows what it's saying. Idle is a glance; busy is a read. */
  const liveTranscript = voice.transcript.trim();
  const heeftGesprek = Boolean(laatste.user || laatste.axe || liveTranscript);
  // The exchange is now the shell's persistent conversation glance. Do not
  // make it vanish the millisecond TTS finishes; that recreates the old
  // "where did my message go?" problem above the composer.
  const actief = Boolean(pending) || Boolean(activiteit) || voice.voiceStatus !== 'idle' || heeftGesprek;
  // An approval must stay reachable no matter how little room there is --
  // never drop to the text-less mini variant while one is pending.
  const minModus: ActievePositie['modus'] = pending ? 'compact' : 'mini';

  /* Luka, 21 sep 2026 (round 4): both the idle particle's X and the active
     card's X are MEASURED against real DOM anchors (the bottom nav's AXE
     label slot; the composer; any visible right rail) -- never a hardcoded
     per-page offset. Re-measured on mount, on resize, and whenever `actief`
     flips, since that's exactly when the right answer changes. */
  const [anker, setAnker] = useState<{ x: number; y: number } | null>(null);
  const [actievePositie, setActievePositie] = useState<ActievePositie>(() => metingActievePositie());
  /* Fix C: null on every tab without MemoryDock (or where it isn't tall
     enough to reach) -- the card then keeps its plain CSS height. */
  const [maxHoogte, setMaxHoogte] = useState<number | null>(() => metingMaxHoogte());
  useEffect(() => {
    const meet = () => {
      // Both axes, not just X (round 5 live review): a fixed `bottom: 22px`
      // guessed where the anchor slot's own vertical centre would land and
      // put the idle particle right on the bottom nav's top edge instead --
      // exactly the kind of drift measuring was supposed to prevent. Same
      // fix as the composer/rail measurements above: read the real slot.
      const r = vindDoel('axe-voice-orb-anchor');
      setAnker(r ? { x: r.x + r.b / 2, y: r.y + r.h / 2 } : null);
      setActievePositie(prev => {
        const next = metingActievePositie();
        return next.links === prev.links && next.modus === prev.modus ? prev : next;
      });
      setMaxHoogte(metingMaxHoogte());
    };
    meet();
    window.addEventListener('resize', meet);
    /* Whatever is adopted into the dock slot changes height on a click
       (open/closed) -- MemoryDock on Neural/Terrain, DealsTabel on NorthSea
       Desk -- which fires no resize event -- without watching the SLOT HOST
       directly the card would only reflow the next time the window itself
       resized. Round 7, Fix 1: watches `#axe-slot-dock` itself (see
       `vindSlotDok()` above) instead of one named child, so this covers
       whichever page's content is currently inside it. */
    let dokObs: ResizeObserver | null = null;
    const dokEl = document.getElementById(SLOT_ID.dock);
    if (dokEl && 'ResizeObserver' in window) {
      dokObs = new ResizeObserver(meet);
      dokObs.observe(dokEl);
    }
    /* Corrective round 8: same shape of problem as the dock above, different
       host -- a tab's onderband right content (`#axe-slot-rechts`, see
       `vindOnderbandSlotRechts()` above) appears and disappears purely by
       mounting/unmounting on a TAB SWITCH (`.axe-slot:empty { display:none }`
       means an empty host is a zero rect, a filled one is not), which is
       exactly the kind of size change a ResizeObserver on the host itself
       catches regardless of whether the window ever resizes. Observing
       unconditionally (the element exists from PlaatSlotHosts even when
       empty) means this also picks up the rarer case of the SAME host
       switching between its onderband and `--hoog` shape, since that swap
       changes its measured width too. */
    let rechtsObs: ResizeObserver | null = null;
    const rechtsEl = document.getElementById(SLOT_ID.rechts);
    if (rechtsEl && 'ResizeObserver' in window) {
      rechtsObs = new ResizeObserver(meet);
      rechtsObs.observe(rechtsEl);
    }
    /* Corrective round 6, Part 4: same shape of problem as MemoryDock above,
       different element -- the right radial dock toggles `data-open` on a
       click (RadiaalDok.tsx), which fires no resize event anywhere (its own
       box is a fixed 268px square regardless of open/closed, see
       `vindOpenRadiaalRechts`'s comment). Without watching that attribute
       directly, the card would only pick up the ring having opened the next
       time something else happened to re-measure -- not "never overlap it",
       just "eventually stop overlapping it". */
    let radiaalObs: MutationObserver | null = null;
    const radiaalEl = document.querySelector<HTMLElement>('[data-axe-doel="radiaal-rechts"]');
    if (radiaalEl && 'MutationObserver' in window) {
      radiaalObs = new MutationObserver(meet);
      radiaalObs.observe(radiaalEl, { attributes: true, attributeFilter: ['data-open'] });
    }
    /* Corrective round 7, Fix 3: `vindZichtbareRechterRail()` already reads
       this obstacle, but nothing ever re-measured when it actually changes.
       The hover rail's open/closed state is `data-rail-r` on `<html>`
       (AxeShellChrome.tsx sets it on mousemove, not on click, so there is no
       existing click handler to piggyback on), and this component watched
       neither it nor any event the mousemove handler emits -- so sliding the
       rail open reported stale geometry until some UNRELATED re-measure
       (resize, the dock, the radial ring) happened to also fire. Same fix
       shape as the radial-ring observer above, different attribute. */
    let railObs: MutationObserver | null = null;
    if ('MutationObserver' in window) {
      railObs = new MutationObserver(meet);
      railObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-rail-r'] });
    }
    /* Same shape again: `RightPanel.tsx` toggles `data-rail-vast` on its own
       aside from React state (the collapse chevron), which -- like the
       radial ring's `data-open` -- fires no resize event. Without this, the
       vertical-overlap check above would use whatever the rail's rect
       happened to be at the last unrelated re-measure. */
    let railVastObs: MutationObserver | null = null;
    const railEl = document.querySelector<HTMLElement>('[data-rail="right"]');
    if (railEl && 'MutationObserver' in window) {
      railVastObs = new MutationObserver(meet);
      railVastObs.observe(railEl, { attributes: true, attributeFilter: ['data-rail-vast'] });
    }
    return () => {
      window.removeEventListener('resize', meet);
      dokObs?.disconnect();
      rechtsObs?.disconnect();
      radiaalObs?.disconnect();
      railObs?.disconnect();
      railVastObs?.disconnect();
    };
  }, [actief]);

  const modus: ActievePositie['modus'] = actievePositie.modus === 'vol' ? 'vol'
    : actievePositie.modus === 'compact' ? 'compact'
    : minModus;
  const breedte = modus === actievePositie.modus ? actievePositie.breedte
    : modus === 'compact' ? BREEDTE_COMPACT : BREEDTE_MINI;

  return (
    <>
      {!actief && (
        <div className="axe-presence-idle" style={anker ? { left: anker.x, top: anker.y } : undefined} aria-hidden="true">
          <AxeStatusOrb size={64} toonLabel={false} werk={werk} status={presenceStatus} />
        </div>
      )}
      {actief && (
        // A <div>, not <aside>: axe-look.css turns every .axe-shell aside into a hidden,
        // off-screen drawer by default (the same rule CodeEditorPage's file tree avoids for
        // the same reason) -- this widget needs to be visible by default, not opt-in-visible.
        <div
          className="axe-presence-dock" data-modus={modus} role="complementary" aria-label="AXE presence" data-axe-doel="axe-presence"
          style={{
            left: actievePositie.links,
            width: breedte,
            // Fix C: overrides the CSS `height: var(--axe-composer-hoog)`
            // only when MemoryDock's real, measured bottom edge would
            // otherwise land inside this card -- see metingMaxHoogte().
            ...(maxHoogte != null ? { height: maxHoogte, maxHeight: maxHoogte } : null),
          }}
        >
          <div ref={orbRef} className="axe-presence-dock__orb">
            {/* Only 20 (inline-text) or 64 (chat-avatar) exist -- thinking-orbs ships exactly
                two tuned presets, not a scale factor (see AxeStatusOrb's own doc comment). */}
            <AxeStatusOrb size={64} toonLabel={false} werk={werk} status={presenceStatus} />
          </div>
          {modus !== 'mini' && (
            <div className="axe-presence-dock__body">
              <div className="axe-presence-dock__head">
                <span>AXE</span>
              </div>

              {pending ? (
                <div className="axe-presence-dock__approval">
                  <span title={pending.detail}>{pending.title}</span>
                  <button type="button" title="Approve" onClick={() => voice.resolvePendingExec(pending.id, true)}>
                    <Check size={13} />
                  </button>
                  <button type="button" title="Deny" onClick={() => voice.resolvePendingExec(pending.id, false)}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                // Corrective round 7, Fix 3: this was gated on `modus ===
                // 'vol'`, so `compact` rendered NOTHING here beyond the "AXE"
                // head above -- not truncated text, no text at all. That is
                // the actual "unreadable" Luka saw on the Code Editor: the
                // card wasn't too narrow to read, it had nothing to read,
                // regardless of the radial ring's state, because neither
                // affects `modus` once it has already dropped below 'vol'.
                // `compact`'s box is the SAME HEIGHT as `vol` (only the width
                // shrinks -- see `.axe-presence-dock` in axe-look.css), and
                // each line already clamps to 2 lines, so showing text here
                // does not risk overflow. `compact` shows AXE's own line
                // only -- what AXE said is the thing worth reading in a
                // tight space; the user's own line (which they just typed)
                // is the one dropped, not the other way round.
                <div className="axe-presence-dock__exchange" aria-live="polite">
                  {modus === 'vol' && (liveTranscript || laatste.user) && (
                    <p data-van="mij">{liveTranscript || laatste.user?.text}</p>
                  )}
                  {laatste.axe && <p data-van="axe">{laatste.axe.text}</p>}
                  {!liveTranscript && !laatste.user && !laatste.axe && <p data-van="axe">I am here with this workspace.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <BolVlucht vlucht={vlucht} klaar={() => setVlucht(null)} />
    </>
  );
}
