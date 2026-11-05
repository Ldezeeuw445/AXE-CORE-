/**
 * Always-on AXE floating notch — louis_rlee / Mochi visual language.
 * Collapsed: HQ dark-shell pill (#0A0A0A) + blob + home/chat/+/settings/volume.
 * Expanded: chat history, composer, drop zone, live activity, approvals.
 * Icons are wired; body always fills the window when open (no empty glass).
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Home, MessageSquare, Plus, Settings, Volume2, Paperclip, X } from 'lucide-react';
import { aiProxyUrl, vpsAuthHeaders, isTauriRuntime, VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';
import {
  listPendingApprovals,
  type DurableTaskApproval,
} from '@/infrastructure/gateways/axeCoreApiService';
import { beslisApproval } from '@/application/approvals/beslisAgentOk';
import './AxeOverlayNotch.css';
import { groepeerSleep, sorteerSleep, type GesleeptItem, type SleepInvoer } from '@/domain/overlay/gesleepteItems';
import { beoordeelNotch } from '@/domain/overlay/notchLeven';
import { projectieUitVraag } from '@/application/sphere/vraagRouter';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { NotchResultaat } from './NotchResultaat';

type Tab = 'chat' | 'approvals' | 'settings';

type Msg = { role: 'user' | 'assistant' | 'system'; content: string; at: number };

const MANAGERS = [
  { id: 'axe', label: 'AXE' },
  { id: 'projects', label: 'Projects' },
  { id: 'axe-core', label: 'CORE' },
  { id: 'companion', label: 'Companion' },
  { id: 'trading', label: 'Trading OS' },
  { id: 'axon', label: 'AXON' },
  { id: 'northsea', label: 'NorthSea' },
] as const;


function isDangerousApproval(a: DurableTaskApproval): boolean {
  const blob = `${a.kind || ''} ${a.title || ''} ${a.detail || ''} ${a.wat || ''}`.toLowerCase();
  return /trade|trading|order|payment|pay|transfer|wire|sepa|iban|purchase|buy\b|sell\b/.test(blob);
}

async function focusMainShell() {
  if (!isTauriRuntime()) {
    window.location.hash = '#/';
    return;
  }
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const main = await WebviewWindow.getByLabel('main');
    if (main) {
      await main.show();
      await main.unminimize();
      await main.setFocus();
    }
  } catch { /* ignore */ }
}

async function sendChat(text: string, history: Msg[], managerLabel: string): Promise<string> {
  const url = aiProxyUrl();
  const messages = [
    {
      role: 'system',
      content:
        `Je bent ${managerLabel} in de AXE notch. Kort, Nederlands, actiegericht. ` +
        'Nooit secrets, trades of payments uitvoeren vanuit de notch.',
    },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: text },
  ];
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...vpsAuthHeaders(url),
    },
    body: JSON.stringify({
      provider: 'openai',
      model: 'gpt-4o-mini',
      format: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      messages,
      source: 'axe-overlay-notch',
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Chat ${r.status}: ${body.slice(0, 160)}`);
  }
  const data = (await r.json()) as { text?: string; choices?: Array<{ message?: { content?: string } }> };
  return data.text || data.choices?.[0]?.message?.content || '(geen antwoord)';
}

/**
 * Lopende taken, mét of de VPS überhaupt antwoordde.
 *
 * Hier stond `catch { return [] }`. Een lege lijst en een onbereikbare server
 * zien er dan identiek uit, en de notch toont in beide gevallen "niets te
 * doen". Dat is de ene fout die een altijd-aanwezige balk niet mag maken: je
 * vertrouwt dan op iets dat al een uur dood kan zijn. Daarom twee velden.
 */
async function fetchActivity(): Promise<{ ok: boolean; regels: string[] }> {
  try {
    const url = `${VPS_API_ORIGIN}/tasks?limit=12`;
    const r = await fetch(url, { headers: { ...vpsAuthHeaders(url) } });
    if (!r.ok) return { ok: false, regels: [] };
    const data = (await r.json()) as { tasks?: Array<{ title?: string; status?: string; capability?: string }> };
    return {
      ok: true,
      regels: (data.tasks || [])
        .filter((t) => /running|queued|active|in_progress|waiting/i.test(String(t.status || '')))
        .slice(0, 4)
        .map((t) => `${t.title || t.capability || 'task'} · ${t.status}`),
    };
  } catch {
    return { ok: false, regels: [] };
  }
}

export function AxeOverlayNotch({
  onHome,
  onSend,
  onOpenChange,
}: {
  onHome?: () => void;
  onSend?: (text: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [tekst, setTekst] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [files, setFiles] = useState<GesleeptItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [approvals, setApprovals] = useState<DurableTaskApproval[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  // Begint op true: anders roept de notch "geen verbinding" in de seconde
  // vóór de eerste ronde, en dat is een vals alarm bij elke start.
  const [bereikbaar, setBereikbaar] = useState(true);
  const [projectie, setProjectie] = useState<ProjectionPayload | null>(null);
  const [managerIdx, setManagerIdx] = useState(0);
  const [statusNote, setStatusNote] = useState('');
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const manager = MANAGERS[managerIdx] || MANAGERS[0];

  /**
   * Eén toestand voor de hele strook — ingeklapt én open.
   *
   * Ingeklapt was de notch tot nu toe stom: de bol stond stil en wat hier
   * binnenkwam werd alleen in `axe-ov__body` getekend, en die bestaat niet als
   * hij dicht is. Je kon dus niet zien of AXE meeluisterde, bezig was, op je
   * wachtte of al een uur niets meer hoorde. De volgorde bij meerdere
   * signalen staat in `domain/overlay/notchLeven`, met de redenen erbij.
   */
  const leven = beoordeelNotch({
    luistert: listening,
    denkt: busy,
    bereikbaar,
    approvals: approvals.length,
    taken: activity.length,
  });

  const set = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        onOpenChange?.(next);
        return next;
      });
    },
    [onOpenChange],
  );

  // If the window is already tall (oversized empty glass), open the body once on mount.
  // Do NOT depend on onOpenChange — FloatAxe passes an inline lambda, so a dependency
  // would re-fire after every collapse and immediately expand again.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerHeight > 120) {
      setOpen(true);
      onOpenChange?.(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, tab]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      // Beide rondes apart, zodat één storing de andere niet meesleept — en
      // zodat `bereikbaar` echt betekent "we hebben net iets gehoord".
      // Begin op false en word alleen waar als er écht geantwoord is. De
      // andere kant op (begin true, zet false bij een fout) laat een pad dat
      // niemand voorzag doorgaan als "bereikbaar", en dat is de ene leugen
      // die deze strook niet mag vertellen.
      let approvalsOk = false;
      let takenOk = false;
      try {
        const a = await listPendingApprovals(12);
        if (!cancelled) setApprovals(a.filter((x) => x.status === 'pending'));
        approvalsOk = true;
      } catch {
        /* onbereikbaar; de vorige lijst blijft staan */
      }
      try {
        const act = await fetchActivity();
        if (act.ok) {
          if (!cancelled) setActivity(act.regels);
          takenOk = true;
        }
      } catch {
        /* onbereikbaar */
      }
      if (!cancelled) setBereikbaar(approvalsOk && takenOk);
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Hammerspoon / parent shell can dispatch: window.dispatchEvent(new CustomEvent('axe-overlay-cmd',{detail:'expand'}))
  useEffect(() => {
    const onCmd = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.trim()) void handleCmd(detail.trim());
    };
    window.addEventListener('axe-overlay-cmd', onCmd as EventListener);
    return () => window.removeEventListener('axe-overlay-cmd', onCmd as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvals, manager.label]);

  const handleCmd = async (cmd: string) => {
    if (cmd === 'expand' || cmd === 'chat') {
      set(true);
      setTab('chat');
      return;
    }
    if (cmd === 'collapse') {
      set(false);
      return;
    }
    if (cmd === 'approvals') {
      set(true);
      setTab('approvals');
      return;
    }
    if (cmd === 'approve-top') {
      set(true);
      setTab('approvals');
      const top = approvals[0];
      if (!top) {
        setStatusNote('Geen pending approvals');
        return;
      }
      if (isDangerousApproval(top)) {
        setStatusNote('Geblokkeerd: trades/payments niet via notch');
        return;
      }
      try {
        await beslisApproval(top.task_id, top.id, true, 'notch F15 hold');
        setStatusNote(`Goedgekeurd: ${top.title || top.kind}`);
        setApprovals((prev) => prev.filter((a) => a.id !== top.id));
      } catch (e) {
        setStatusNote(`Approval fout: ${(e as Error).message}`);
      }
      return;
    }
    if (cmd === 'ptt-start') {
      set(true);
      setTab('chat');
      togglePtt(true);
      return;
    }
    if (cmd === 'ptt-stop') {
      togglePtt(false);
      return;
    }
    if (cmd.startsWith('ask:')) {
      set(true);
      setTab('chat');
      void doSend(cmd.slice(4));
      return;
    }
    if (cmd === 'ask-about-this') {
      set(true);
      setTab('chat');
      void doSend('what is this, what should I do? (selectie/clipboard + screenshot context)');
      return;
    }
    if (cmd === 'northsea-brief' || cmd === 'daily-brief') {
      set(true);
      setTab('chat');
      void doSend(cmd === 'daily-brief' ? 'Geef een korte daily brief: approvals, NorthSea, app status, trading demo.' : 'Geef een kort NorthSea brief: nieuwe deal-replies en next actions.');
      return;
    }
    if (cmd === 'manager-next') {
      setManagerIdx((i) => (i + 1) % MANAGERS.length);
      set(true);
      return;
    }
    if (cmd === 'manager-prev') {
      setManagerIdx((i) => (i - 1 + MANAGERS.length) % MANAGERS.length);
      set(true);
      return;
    }
    if (cmd === 'manager-open') {
      set(true);
      setTab('chat');
      setMessages((m) => [
        ...m,
        { role: 'system', content: `Manager: ${manager.label}`, at: Date.now() },
      ]);
      return;
    }
    if (cmd === 'focus-on' || cmd === 'focus-off') {
      setStatusNote(cmd === 'focus-on' ? 'Focus mode aan — AXE dempt notificaties' : 'Focus mode uit');
      set(true);
    }
  };

  const doSend = async (raw?: string) => {
    const text = (raw ?? tekst).trim();
    if ((!text && files.length === 0) || busy) return;
    const fileBlock =
      files.length === 0
        ? ''
        : `\n\n[Meegestuurd]\n${files.map((f) => `- ${f.label} (${f.soort}${f.grootte != null ? `, ${f.grootte} B` : ''})`).join('\n')}`;
    const payload = (text || 'Bestanden ontvangen — wat moet ik ermee?') + fileBlock;
    setTekst('');
    setFiles([]);
    setMessages((m) => [...m, { role: 'user', content: payload, at: Date.now() }]);
    setBusy(true);
    onSend?.(payload);

    /* "Laat me de kaart van LA zien" hoort niet als alinea tekst terug te
       komen, en ook niet op Home te landen -- dat is juist het venster dat je
       net geminimaliseerd hebt. Dit loopt naast het antwoord, niet ervoor:
       een geocode die traag is of mislukt mag het gesprek niet ophouden, en
       als de vraag niets te tonen heeft (het normale geval) blijft het stil. */
    void (async () => {
      try {
        const p = await projectieUitVraag(text);
        if (p) setProjectie(p);
      } catch {
        /* geen resultaatkaart; het tekstantwoord komt gewoon */
      }
    })();
    try {
      const reply = await sendChat(payload, messages, manager.label);
      setMessages((m) => [...m, { role: 'assistant', content: reply, at: Date.now() }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Fout: ${(e as Error).message}`, at: Date.now() },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const togglePtt = (force?: boolean) => {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      setStatusNote('Spraakherkenning niet beschikbaar');
      return;
    }
    const wantStart = force === true || (force !== false && !listening);
    if (!wantStart) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'nl-NL';
    rec.onresult = (ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => {
      let final = '';
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else setTekst(r[0].transcript);
      }
      if (final.trim()) {
        setTekst(final.trim());
        void doSend(final.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  /**
   * Alles wat erin valt, gesorteerd in bakjes.
   *
   * Hiervoor nam de notch alleen `dataTransfer.files`: een gesleepte link of
   * een stuk tekst lichtte de rand op en verdween daarna. En alles wat wél
   * binnenkwam belandde op één hoop, waarin je weer moest zoeken.
   *
   * Het sorteren zelf staat in `domain/overlay/gesleepteItems` — zonder DOM,
   * zodat elk geval te toetsen is zonder browser.
   */
  const neemSleepAan = (invoer: SleepInvoer) => {
    const items = sorteerSleep(invoer);
    if (items.length === 0) return;
    setFiles((p) => [...p, ...items].slice(0, 12));
    set(true);
    setTab('chat');
  };

  const onDropFiles = (list: FileList | File[]) => {
    neemSleepAan({ bestanden: Array.from(list).map((f) => ({ name: f.name, size: f.size })) });
  };

  const icons = (
    <>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="Home"
        title="Open AXE CORE shell"
        onClick={() => {
          set(false);
          onHome?.();
          void focusMainShell();
        }}
      >
        <Home size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="Chat"
        aria-pressed={open && tab === 'chat'}
        title="Chat"
        onClick={() => {
          set(true);
          setTab('chat');
          setTimeout(() => inputRef.current?.focus(), 80);
        }}
      >
        <MessageSquare size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="New"
        title="Nieuwe chat / bijlage"
        onClick={() => {
          set(true);
          setTab('chat');
          setMessages([]);
          setFiles([]);
          setTekst('');
          setProjectie(null);
          fileRef.current?.click();
        }}
      >
        <Plus size={15} strokeWidth={1.7} />
      </button>
    </>
  );
  const iconsRight = (
    <>
      <button
        type="button"
        className="axe-ov__ico"
        aria-label="Settings"
        aria-pressed={open && tab === 'settings'}
        title="Instellingen"
        onClick={() => {
          set(true);
          setTab('settings');
        }}
      >
        <Settings size={15} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className={`axe-ov__ico ${listening ? 'axe-ov__ico--hot' : ''}`}
        aria-label="Volume"
        aria-pressed={listening}
        title={listening ? 'Stop push-to-talk' : 'Push-to-talk'}
        onClick={() => {
          set(true);
          setTab('chat');
          togglePtt();
        }}
      >
        <Volume2 size={15} strokeWidth={1.7} />
      </button>
    </>
  );

  return (
    <div
      className={`axe-ov ${open ? 'axe-ov--open' : 'axe-ov--notch'} ${dragging ? 'axe-ov--drag' : ''}`}
      data-axe-overlay
      onDragEnter={(e: DragEvent) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={(e: DragEvent) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        // Bestanden, links én tekst. Eén sleep levert vaak twee vormen van
        // hetzelfde op (een uri-list plus dezelfde URL als platte tekst);
        // sorteerSleep ontdubbelt dat, dus ze mogen hier alle drie mee.
        neemSleepAan({
          bestanden: Array.from(e.dataTransfer.files ?? []).map((f) => ({ name: f.name, size: f.size })),
          uriList: e.dataTransfer.getData('text/uri-list') || null,
          tekst: e.dataTransfer.getData('text/plain') || null,
        });
      }}
    >
      <div className="axe-ov__stars" aria-hidden="true" />
      <div className="axe-ov__top" data-tauri-drag-region>
        <div className="axe-ov__icons">{icons}</div>
        {/* De bol ademt, en zodra er iets is staat het woord ernaast. De kleur
            zit in dat woord; de bol krijgt alleen een ring (wet 10). */}
        <div className="axe-ov__hart">
          <span className="axe-ov__bol" data-toestand={leven.toestand}>
            <span className="axe-ov__ring" aria-hidden="true" />
            <button
              type="button"
              className="axe-ov__blob"
              aria-label={`${open ? 'Collapse' : 'Expand'} AXE — ${leven.uitleg}`}
              onClick={() => set((v) => !v)}
              title={`${manager.label} — ${leven.uitleg}`}
            />
          </span>
          {leven.woord !== '' && (
            <button
              type="button"
              className={`axe-ov__leven axe-ov__leven--${leven.toestand}`}
              title={leven.uitleg}
              onClick={() => {
                set(true);
                // Het woord is ook de kortste weg naar waar het over gaat.
                setTab(leven.toestand === 'wacht' ? 'approvals' : 'chat');
              }}
            >
              {leven.telling !== null && <b>{leven.telling}</b>}
              {leven.woord}
            </button>
          )}
        </div>
        <div className="axe-ov__icons">{iconsRight}</div>
      </div>

      {open && (
        <div className="axe-ov__body">
          <div className="axe-ov__manager">
            <button type="button" className="axe-ov__mgr-btn" onClick={() => setManagerIdx((i) => (i - 1 + MANAGERS.length) % MANAGERS.length)} aria-label="Vorige manager">‹</button>
            <span>{manager.label}</span>
            <button type="button" className="axe-ov__mgr-btn" onClick={() => setManagerIdx((i) => (i + 1) % MANAGERS.length)} aria-label="Volgende manager">›</button>
            {approvals.length > 0 && (
              <button type="button" className="axe-ov__appr-badge" onClick={() => setTab('approvals')}>
                {approvals.length} approval{approvals.length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          {(activity.length > 0 || dragging) && (
            <div className="axe-ov__activity">
              {dragging && <div className="axe-ov__drop-hint">Drop → AXE</div>}
              {activity.map((line, i) => (
                <div key={i} className="axe-ov__act-chip"><span className="dot" />{line}</div>
              ))}
            </div>
          )}

          {statusNote && (
            <div className="axe-ov__note">
              {statusNote}
              <button type="button" aria-label="Sluit" onClick={() => setStatusNote('')}><X size={12} /></button>
            </div>
          )}

          {tab === 'chat' && (
            <>
              <div className="axe-ov__messages" ref={listRef}>
                {messages.length === 0 && (
                  <p className="axe-ov__empty">
                    AXE always on your side — vraag iets, sleep bestanden, of PTT via de speaker.
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`axe-ov__msg axe-ov__msg--${m.role}`}>{m.content}</div>
                ))}
                {busy && (
                  <div className="axe-ov__dots" aria-label="Bezig">
                    <span /><span /><span />
                  </div>
                )}
              </div>

              {projectie && (
                <NotchResultaat projectie={projectie} onSluit={() => setProjectie(null)} />
              )}

              {/* Per bakje, niet op één hoop. Een kopje verschijnt alleen als
                  er iets in zit; "Downloads" boven niets is ruis. */}
              {files.length > 0 && groepeerSleep(files).map((groep) => (
                <div className="axe-ov__groep" key={groep.groep}>
                  <div className="axe-ov__groep-kop">
                    <span>{groep.label}</span>
                    <span className="axe-ov__groep-telling">{groep.items.length}</span>
                  </div>
                  <ul className="axe-ov__files">
                    {groep.items.map((f) => (
                      <li key={`${f.groep}-${f.label}-${f.waarde ?? ''}`}>
                        <span className="axe-ov__pdf">{f.soort}</span>
                        <span>{f.label}</span>
                        <span className="axe-ov__bestemming" title={f.bestemming === 'axon' ? 'Gaat naar het geheugen' : 'Gaat mee in het gesprek'}>
                          {f.bestemming === 'axon' ? 'AXON' : 'chat'}
                        </span>
                        <button
                          type="button"
                          aria-label="Verwijder"
                          onClick={() => setFiles((p) => p.filter((x) => x !== f))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <form
                className="axe-ov__input"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doSend();
                }}
              >
                <button
                  type="button"
                  className="axe-ov__attach-btn"
                  aria-label="Bijlage"
                  title="Bestand toevoegen"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip size={14} />
                </button>
                <input
                  ref={inputRef}
                  value={tekst}
                  placeholder="Bericht aan AXE…"
                  onChange={(e) => setTekst(e.target.value)}
                  aria-label="Message AXE"
                />
                <button type="submit" className="axe-ov__send" aria-label="Send" disabled={busy || (!tekst.trim() && files.length === 0)}>↑</button>
              </form>
            </>
          )}

          {tab === 'approvals' && (
            <div className="axe-ov__approvals">
              {approvals.length === 0 ? (
                <p className="axe-ov__empty">Geen pending approvals.</p>
              ) : (
                approvals.map((a) => (
                  <div key={a.id} className="axe-ov__appr-card">
                    <strong>{a.title || a.kind}</strong>
                    <p>{a.wat || a.detail || a.waarom || ''}</p>
                    {isDangerousApproval(a) ? (
                      <em className="axe-ov__warn">Trade/payment — keur goed in AXE CORE, niet hier.</em>
                    ) : (
                      <div className="axe-ov__appr-actions">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await beslisApproval(a.task_id, a.id, true, 'notch');
                              setApprovals((prev) => prev.filter((x) => x.id !== a.id));
                              setStatusNote('Goedgekeurd');
                            } catch (e) {
                              setStatusNote((e as Error).message);
                            }
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={async () => {
                            try {
                              await beslisApproval(a.task_id, a.id, false, 'notch reject');
                              setApprovals((prev) => prev.filter((x) => x.id !== a.id));
                            } catch (e) {
                              setStatusNote((e as Error).message);
                            }
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="axe-ov__settings">
              <label className="axe-ov__check">
                <input
                  type="checkbox"
                  checked={launchAtLogin}
                  onChange={async (e) => {
                    const on = e.target.checked;
                    setLaunchAtLogin(on);
                    setStatusNote(on ? 'Launch at login: zet aan via Overlay Login Items / System Settings' : 'Launch at login uit');
                  }}
                />
                Launch overlay at login
              </label>
              <p className="axe-ov__hint">API key via ~/.axe/axe-api.key — nooit in de UI getoond.</p>
              <button type="button" className="axe-ov__link" onClick={() => void focusMainShell()}>Open AXE CORE shell</button>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onDropFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
