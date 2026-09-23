/**
 * AXE Presence — the compact, persistent AXE that follows every workspace.
 *
 * Home keeps its full Core Sphere. This is not a replacement for that scene.
 * The presence owns the 64px orb (always centred over the "AXE" label in the
 * bottom nav, so the word sits inside the orb), the activity flight, and the
 * invisible chat cloud right of the composer where the conversation between
 * Luka and AXE shows (see the comment above `metingWolk`). It lives in shell chrome, so
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
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';

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
      // `<=` plus 1px: a pinned rail that ENDS where the composer row begins
      // (measured 23 sep at 2560px: rail bottom 1145 == composer top 1145)
      // only touches it. With a strict `<` that touch counted as an overlap
      // and squeezed the chat to a third of its room.
      if (composer && r.bottom <= composer.y + 1) continue;
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
/** Gap kept before whatever stops the chat on the right (radial, side tabs). */
const VOOR_OBSTAKEL_GAP = 12;
/** Below this there is no room to read a conversation -- the cloud stays
 *  away rather than squeezing text into a sliver (the old 40px "mini" card
 *  that clipped the orb to a dotted arc: "verstoppertje", Luka 23 sep). */
const MIN_WOLK = 180;
/** Kept clear above whatever is currently the top of the dock strip -- same
 *  role as NA_COMPOSER_GAP, just on the vertical axis. */
const BOVEN_DOK_GAP = 10;

interface WolkRuimte { links: number; breedte: number }

/**
 * The invisible chat cloud (Luka, 23 sep 2026): the conversation between him
 * and AXE takes ALL the free room right of the composer, up to the right
 * radial -- and never over a tab's own side content, an open radial ring or
 * a pinned rail. Same obstacles as before; the difference is the width is no
 * longer capped at a 210px card, it is whatever is actually free.
 */
function metingWolk(): WolkRuimte {
  const composer = vindDoel('axe-composer');
  const obstakel = HORIZONTALE_OBSTAKELS.reduce((dichtstbij, vind) => {
    const r = vind();
    return r ? Math.min(dichtstbij, r.x) : dichtstbij;
  }, Infinity);
  const plafond = Math.min(window.innerWidth - RADIAAL_RESERVE, obstakel - VOOR_OBSTAKEL_GAP);
  const links = (composer ? composer.x + composer.b : window.innerWidth * 0.6) + NA_COMPOSER_GAP;
  return { links, breedte: Math.max(0, plafond - links) };
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

  /* Luka, 23 sep 2026: "met adaptive bedoel ik de onzichtbare panel waar de
     chat tussen mij en axe in staat". Two things changed:
     1. The orb keeps ONE place -- centred over the AXE label in the bottom
        nav -- and never moves into a card. It used to slide into a card beside
        the composer that shrank to a 40px "mini" whenever room was tight,
        clipping the 64px orb to a dotted arc ("verstoppertje").
     2. The conversation lives in an invisible cloud: all the free room right of
        the composer up to the right radial, stopping short of a tab's side
        content, an open radial ring or a pinned rail -- no card, no 2-line
        clamp. On Home the full chat plate is open (`data-chat='open'`, set by
        PlaatChat), so the cloud stays away there instead of showing it twice. */
  const liveTranscript = voice.voiceStatus === 'listening' ? voice.transcript.trim() : '';
  const berichten = useMemo(
    () => voice.conversation.filter(m => m.text?.trim()).slice(-24),
    [voice.conversation],
  );
  const heeftIets = berichten.length > 0 || Boolean(liveTranscript) || Boolean(pending);

  const [anker, setAnker] = useState<{ x: number; y: number } | null>(null);
  const [ruimte, setRuimte] = useState<WolkRuimte>(() => metingWolk());
  const [maxHoogte, setMaxHoogte] = useState<number | null>(() => metingMaxHoogte());
  const [chatPlaatOpen, setChatPlaatOpen] = useState(() => document.documentElement.dataset.chat === 'open');
  useEffect(() => {
    const meet = () => {
      const r = vindDoel('axe-voice-orb-anchor');
      setAnker(r ? { x: r.x + r.b / 2, y: r.y + r.h / 2 } : null);
      setRuimte(prev => {
        const next = metingWolk();
        return next.links === prev.links && next.breedte === prev.breedte ? prev : next;
      });
      setMaxHoogte(metingMaxHoogte());
      setChatPlaatOpen(document.documentElement.dataset.chat === 'open');
    };
    meet();
    window.addEventListener('resize', meet);
    const obs: Array<ResizeObserver | MutationObserver> = [];
    const kanRO = 'ResizeObserver' in window;
    const kanMO = 'MutationObserver' in window;
    /* Everything that can move the cloud's edges without a window resize:
       - the dock slot above (MemoryDock / DealsTabel open and close),
       - a tab's own side content right of the composer (mounts on tab switch),
       - the composer itself (its width follows the layout),
       - the right radial opening (`data-open`),
       - the hover rail (`data-rail-r`) and the chat plate (`data-chat`) on <html>,
       - the pinned right rail (`data-rail-vast`). */
    for (const el of [
      document.getElementById(SLOT_ID.dock),
      document.getElementById(SLOT_ID.rechts),
      document.querySelector<HTMLElement>('[data-axe-doel="axe-composer"]'),
    ]) {
      if (el && kanRO) { const o = new ResizeObserver(meet); o.observe(el); obs.push(o); }
    }
    if (kanMO) {
      const radiaal = document.querySelector<HTMLElement>('[data-axe-doel="radiaal-rechts"]');
      if (radiaal) { const o = new MutationObserver(meet); o.observe(radiaal, { attributes: true, attributeFilter: ['data-open'] }); obs.push(o); }
      const html = new MutationObserver(meet);
      html.observe(document.documentElement, { attributes: true, attributeFilter: ['data-rail-r', 'data-chat'] });
      obs.push(html);
      const rail = document.querySelector<HTMLElement>('[data-rail="right"]');
      if (rail) { const o = new MutationObserver(meet); o.observe(rail, { attributes: true, attributeFilter: ['data-rail-vast'] }); obs.push(o); }
    }
    return () => {
      window.removeEventListener('resize', meet);
      for (const o of obs) o.disconnect();
    };
  }, [heeftIets]);

  // An approval must stay reachable even when room is tight: it gets the
  // minimum width rather than disappearing. Plain conversation just waits for room.
  const genoegRuimte = ruimte.breedte >= MIN_WOLK;
  const toonWolk = heeftIets && !chatPlaatOpen && (genoegRuimte || Boolean(pending));
  const breedte = genoegRuimte ? ruimte.breedte : MIN_WOLK;

  /* Newest at the bottom, like any chat. Stick to the bottom while the reply
     grows (AXE types while it speaks), unless Luka scrolled up to reread. */
  const lijstRef = useRef<HTMLDivElement | null>(null);
  const inhoudRef = useRef<HTMLDivElement | null>(null);
  const plakOnder = useRef(true);
  useEffect(() => { plakOnder.current = true; }, [berichten.length, liveTranscript]);
  useEffect(() => {
    const lijst = lijstRef.current;
    const inhoud = inhoudRef.current;
    if (!lijst || !inhoud) return;
    const naarOnder = () => { if (plakOnder.current) lijst.scrollTop = lijst.scrollHeight; };
    naarOnder();
    if (!('ResizeObserver' in window)) return;
    const o = new ResizeObserver(naarOnder);
    o.observe(inhoud);
    return () => o.disconnect();
  }, [toonWolk]);

  return (
    <>
      <div
        ref={orbRef}
        className="axe-presence-idle"
        data-axe-doel="axe-presence"
        style={anker ? { left: anker.x, top: anker.y } : undefined}
        aria-hidden="true"
      >
        {/* Only 20 or 64 exist -- thinking-orbs ships two tuned presets. */}
        <AxeStatusOrb size={64} toonLabel={false} werk={werk} status={presenceStatus} />
      </div>
      {toonWolk && (
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation with AXE"
          style={{
            position: 'fixed',
            left: ruimte.links,
            width: breedte,
            bottom: 'var(--axe-composer-onder, 104px)',
            height: maxHoogte ?? 'var(--axe-composer-hoog, 90px)',
            zIndex: 104,
          }}
        >
          <div
            ref={lijstRef}
            onScroll={(e) => {
              const l = e.currentTarget;
              plakOnder.current = l.scrollHeight - l.scrollTop - l.clientHeight < 40;
            }}
            className="h-full overflow-y-auto"
            style={{
              scrollbarWidth: 'none',
              // Older lines fade out upward instead of being cut by a hard edge.
              maskImage: 'linear-gradient(to bottom, transparent 0, #000 26px)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 26px)',
            }}
          >
            <div ref={inhoudRef} className="flex min-h-full flex-col justify-end gap-1.5 px-1 pb-1 pt-6 text-[12.5px] leading-snug">
              {berichten.map((m, i) => (m.role === 'user' ? (
                <p key={`${m.timestamp}-${i}`} className="max-w-[85%] self-end text-right" style={{ color: 'var(--text-muted)' }}>
                  {m.text}
                </p>
              ) : (
                <div key={`${m.timestamp}-${i}`} className="max-w-[92%] self-start" style={{ color: 'var(--text-primary)' }}>
                  <MarkdownMessage text={m.text} />
                </div>
              )))}
              {liveTranscript && (
                <p className="max-w-[85%] self-end text-right italic" style={{ color: 'var(--text-muted)' }}>
                  {liveTranscript}
                </p>
              )}
              {pending && (
                <div className="flex max-w-full items-center gap-2 self-start rounded-lg px-2 py-1" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}>
                  <span className="truncate" title={pending.detail}>{pending.title}</span>
                  <button type="button" title="Approve" onClick={() => voice.resolvePendingExec(pending.id, true)}>
                    <Check size={13} />
                  </button>
                  <button type="button" title="Deny" onClick={() => voice.resolvePendingExec(pending.id, false)}>
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <BolVlucht vlucht={vlucht} klaar={() => setVlucht(null)} />
    </>
  );
}
