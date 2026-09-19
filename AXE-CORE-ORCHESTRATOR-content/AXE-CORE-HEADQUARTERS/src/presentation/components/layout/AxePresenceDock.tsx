/**
 * AXE Presence — the compact, persistent AXE that follows every workspace.
 *
 * Home keeps its full Core Sphere. This is not a replacement for that scene.
 * The presence owns the small 64px state particle, the latest exchange and
 * activity flight. It lives in shell chrome beside the composer, so workspaces
 * (NorthSea map, browser, charts, editors) never have to host an AXE overlay.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { ACTIVITEIT_GEBEURTENIS, type AxeActiviteit } from '@/shared/axeActiviteit';
import { kiesDoel, type Rechthoek } from '@/domain/bolVlucht';
import { BolVlucht, type Vlucht } from '@/presentation/components/layout/zweef/BolVlucht';

function vindDoel(doel: string): Rechthoek | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-axe-doel="${CSS.escape(doel)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, b: r.width, h: r.height };
  }
  return null;
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

      const direct = a.punt
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
      ?? (voice.voiceStatus === 'listening' ? 'Listening'
        : voice.voiceStatus === 'processing' ? 'Working'
          : voice.voiceStatus === 'speaking' ? 'Speaking'
            : 'Ready');

  return (
    <>
      <aside className="axe-presence-dock" aria-label="AXE presence" data-axe-doel="axe-presence">
        <div ref={orbRef} className="axe-presence-dock__orb">
          <AxeStatusOrb size={64} toonLabel={false} werk={werk} status={presenceStatus} />
        </div>
        <div className="axe-presence-dock__body">
          <div className="axe-presence-dock__head">
            <span>AXE</span>
            <span>{statusText}</span>
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
            <div className="axe-presence-dock__exchange" aria-live="polite">
              {laatste.user && <p data-van="mij">{laatste.user.text}</p>}
              {laatste.axe && <p data-van="axe">{laatste.axe.text}</p>}
              {!laatste.user && !laatste.axe && <p data-van="axe">I am here with this workspace.</p>}
            </div>
          )}
        </div>
      </aside>
      <BolVlucht vlucht={vlucht} klaar={() => setVlucht(null)} />
    </>
  );
}
