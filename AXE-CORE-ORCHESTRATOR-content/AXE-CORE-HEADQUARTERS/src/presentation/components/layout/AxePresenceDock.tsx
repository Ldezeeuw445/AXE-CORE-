/**
 * AXE Presence — the compact, persistent AXE that follows every workspace.
 *
 * Home keeps its full Core Sphere. This is not a replacement for that scene.
 * The presence owns the small 20px idle particle (parked under the "AXE"
 * label in the bottom nav) and the 64px active card (beside the composer)
 * with the latest exchange and activity flight. It lives in shell chrome, so
 * workspaces (NorthSea map, browser, charts, editors) never have to host an
 * AXE overlay of their own.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { ACTIVITEIT_GEBEURTENIS, type AxeActiviteit } from '@/shared/axeActiviteit';
import { VOICE_STATUS_LABEL } from '@/presentation/store/voiceStatusLabel';
import { kiesDoel, type Rechthoek } from '@/domain/bolVlucht';
import { BolVlucht, type Vlucht } from '@/presentation/components/layout/zweef/BolVlucht';

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
 *  never constrains anything here. */
function vindZichtbareRechterRail(): Rechthoek | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-rail="right"]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right <= window.innerWidth + 1) return { x: r.left, y: r.top, b: r.width, h: r.height };
  }
  return null;
}

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

interface ActievePositie { links: number; modus: 'vol' | 'compact' | 'mini'; breedte: number }

function metingActievePositie(): ActievePositie {
  const composer = vindDoel('axe-composer');
  const rail = vindZichtbareRechterRail();
  const plafond = Math.min(window.innerWidth - RADIAAL_RESERVE, rail ? rail.x : Infinity);
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
  const statusText = pending
    ? 'Approval required'
    : activiteit?.label
      ?? (voice.voiceStatus === 'idle' ? 'Ready' : VOICE_STATUS_LABEL[voice.voiceStatus]);
  /* Luka, 20 sep 2026 (live review, round 3): resting spot is the middle of the
     bottom nav -- just the particle, no card. The moment AXE is actually doing
     something (talking, thinking, waiting on approval), it moves up beside the
     composer and shows what it's saying. Idle is a glance; busy is a read. */
  const actief = Boolean(pending) || Boolean(activiteit) || voice.voiceStatus !== 'idle';
  // An approval must stay reachable no matter how little room there is --
  // never drop to the text-less mini variant while one is pending.
  const minModus: ActievePositie['modus'] = pending ? 'compact' : 'mini';

  /* Luka, 21 sep 2026 (round 4): both the idle particle's X and the active
     card's X are MEASURED against real DOM anchors (the bottom nav's AXE
     label slot; the composer; any visible right rail) -- never a hardcoded
     per-page offset. Re-measured on mount, on resize, and whenever `actief`
     flips, since that's exactly when the right answer changes. */
  const [ankerX, setAnkerX] = useState<number | null>(null);
  const [actievePositie, setActievePositie] = useState<ActievePositie>(() => metingActievePositie());
  useEffect(() => {
    const meet = () => {
      const r = vindDoel('axe-voice-orb-anchor');
      setAnkerX(r ? r.x + r.b / 2 : null);
      setActievePositie(prev => {
        const next = metingActievePositie();
        return next.links === prev.links && next.modus === prev.modus ? prev : next;
      });
    };
    meet();
    window.addEventListener('resize', meet);
    return () => window.removeEventListener('resize', meet);
  }, [actief]);

  const modus: ActievePositie['modus'] = actievePositie.modus === 'vol' ? 'vol'
    : actievePositie.modus === 'compact' ? 'compact'
    : minModus;
  const breedte = modus === actievePositie.modus ? actievePositie.breedte
    : modus === 'compact' ? BREEDTE_COMPACT : BREEDTE_MINI;

  return (
    <>
      {!actief && (
        <div className="axe-presence-idle" style={ankerX !== null ? { left: ankerX } : undefined} aria-hidden="true">
          <AxeStatusOrb size={20} toonLabel={false} werk={werk} status={presenceStatus} />
        </div>
      )}
      {actief && (
        // A <div>, not <aside>: axe-look.css turns every .axe-shell aside into a hidden,
        // off-screen drawer by default (the same rule CodeEditorPage's file tree avoids for
        // the same reason) -- this widget needs to be visible by default, not opt-in-visible.
        <div
          className="axe-presence-dock" data-modus={modus} role="complementary" aria-label="AXE presence" data-axe-doel="axe-presence"
          style={{ left: actievePositie.links, width: breedte }}
        >
          <div ref={orbRef} className="axe-presence-dock__orb">
            {/* Only 20 (inline-text) or 64 (chat-avatar) exist -- thinking-orbs ships exactly
                two tuned presets, not a scale factor (see AxeStatusOrb's own doc comment). */}
            <AxeStatusOrb size={64} toonLabel={false} werk={werk} status={presenceStatus} />
            {/* Under the particle, not beside "AXE" in the head row (round 5 live
                review): the status is what the particle is doing, so it reads as
                part of the particle rather than a caption for the card header. */}
            <span className="axe-presence-dock__orbstatus">{statusText}</span>
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
              ) : modus === 'vol' && (
                <div className="axe-presence-dock__exchange" aria-live="polite">
                  {laatste.user && <p data-van="mij">{laatste.user.text}</p>}
                  {laatste.axe && <p data-van="axe">{laatste.axe.text}</p>}
                  {!laatste.user && !laatste.axe && <p data-van="axe">I am here with this workspace.</p>}
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
