/**
 * De chat met AXE: de plaat en de composer, op ELKE pagina.
 *
 * ## Waarom dit uit Home is gehaald
 *
 * Dit stond in Home, dus het bestond alleen daar. Op elke andere tab viel je
 * terug op de app-brede onderbalk -- een andere composer, zonder de plaat
 * erboven. Dat is precies wat "Home is de basis" tegenhield: de basis bestond
 * op één pagina.
 *
 * Nu hoort het bij de schil, net als de kopregel, de navigatie en de sloten.
 * Waar je ook bent, je kunt met AXE praten en je ziet wat hij terugzegt; de
 * tab levert alleen wat eromheen staat.
 *
 * ## Wat er meeverhuisde en waarom
 *
 * De sphere-director hoort bij de chat, niet bij Home: hij kijkt naar wat je
 * typt en wat AXE antwoordt, en zet daar een projectie op. Dat werkt alleen als
 * hij meeluistert waar je ook bent. Hij stuurt via de store, dus hij hoeft niet
 * te weten welke pagina open staat.
 *
 * Of de plaat ingeklapt is, staat in coreViewStore en niet hier: Terrain en
 * Neural klappen hem dicht om ruimte te maken, en die beslissing komt van
 * buiten de chat.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Clock, Code2, Globe, MapPin, Mic, Plus, RotateCcw, Send, SlidersHorizontal, Sparkles, Telescope, Terminal, Volume2, VolumeX, Wifi, X, Zap } from 'lucide-react';
import { AxeComposerVak } from '@/presentation/components/layout/AxeComposerVak';
import { ChatModelKiezer } from '@/presentation/components/layout/ChatModelKiezer';
import { MissionControlStrip } from '@/presentation/components/axe-core/MissionControlStrip';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';
import { VisionCaptureButton } from '@/presentation/components/voice/VisionCaptureButton';
import { VermogensKnop } from '@/presentation/components/layout/VermogensKnop';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';
import { resolveMap } from '@/application/sphere/projectionResolvers/mapResolver';
import { resolveChart } from '@/application/sphere/projectionResolvers/chartResolver';
import {
  FileUploadButton,
  type NormalizedAttachment,
  filesToAttachments,
  buildCrewLaunchPrompt,
} from '@/presentation/components/axe-core/FileUploadButton';
import {
  projectionFromAttachments,
  directFromChat,
  directFromAssistantMessageAsync,
  shouldDismissProjection,
} from '@/application/sphere/sphereDirector';
import { designAgentBridge } from '@/presentation/components/axe-core/designAgentBridge';
import { useCodeAgentKop } from '@/presentation/store/codeAgentKopStore';

const iv = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as never } } };

function looksLikeMapRequest(t: string): boolean {
  return /\b(kaart|map|maps|locatie|city|stad)\b/i.test(t)
    || /\b(new\s*york|nyc|tokyo|london|paris|amsterdam|dubai|singapore|berlin)\b/i.test(t);
}
function looksLikeChartRequest(t: string): boolean {
  return /\b(chart|grafiek|graph|plot|trading|btc|eth|koers)\b/i.test(t);
}

export function PlaatChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const voice = useVoiceStore();
  const dismiss = useSphereProjectionStore(s => s.dismiss);
  const setCoreView = useCoreViewStore(s => s.setCoreView);
  const chatCollapsed = useCoreViewStore(s => s.chatDicht);
  const setChatCollapsed = useCoreViewStore(s => s.setChatDicht);

  const [chatText, setChatText] = useState('');
  const [attachments, setAttachments] = useState<NormalizedAttachment[]>([]);
  const [dropActive, setDropActive] = useState(false);
  /* Het paneel achter de klok. Dicht bij het laden: de kopregel hoort leeg te
     beginnen, net als in het voorbeeld. */
  const [paneelOpen, setPaneelOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastProjectedMsgRef = useRef<string>('');
  const lastProjectedUserTsRef = useRef<number>(0);
  const mountedAtRef = useRef(Date.now());
  const lastUserTextRef = useRef<string>('');

  useEffect(() => { void voice.loadConversation(); void voice.loadAllConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = chatScrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [voice.conversation]);

  /* De projectie die uit een ANTWOORD van AXE komt. Hoort bij de chat, niet
     bij Home: hij luistert naar wat er gezegd wordt, en dat moet overal
     werken. Sturen gaat via de store, dus hij hoeft niet te weten welke
     pagina open staat. */
  useEffect(() => {
    const last = [...voice.conversation].reverse().find(m => m.role === 'axe');
    if (!last?.text || last.text === lastProjectedMsgRef.current) return;
    lastProjectedMsgRef.current = last.text;
    let cancelled = false;
    void (async () => {
      let proj = await directFromAssistantMessageAsync(last.text);
      if (!proj && /\[OPEN_WINDOW:[^\]]*maps?/i.test(last.text)) {
        proj = await resolveMap(lastUserTextRef.current || last.text);
      }
      if (!proj && /\[OPEN_WINDOW:[^\]]*trading/i.test(last.text)) {
        proj = await resolveChart(lastUserTextRef.current || last.text);
      }
      if (cancelled || !proj) return;
      setCoreView('axe');
      useSphereProjectionStore.getState().project(proj);
    })();
    return () => { cancelled = true; };
  }, [voice.conversation]);

  /* One user-turn director for BOTH typing and speech.
   *
   * Previously handleChatSend() projected typed requests before send, while
   * SpeechRecognition called voice.sendMessage() directly and skipped this
   * entire path. "Laat New York zien" therefore depended on the input method.
   * Watch the canonical conversation instead: every input path lands there.
   *
   * Old persisted messages are ignored by timestamp so opening AXE does not
   * suddenly replay yesterday's map. */
  useEffect(() => {
    const last = [...voice.conversation].reverse().find(m => m.role === 'user');
    if (!last?.text || last.timestamp < mountedAtRef.current - 1000) return;
    if (last.timestamp === lastProjectedUserTsRef.current) return;
    lastProjectedUserTsRef.current = last.timestamp;
    lastUserTextRef.current = last.text;

    let cancelled = false;
    void (async () => {
      try {
        if (shouldDismissProjection(last.text)) {
          if (!cancelled) dismiss();
          return;
        }
        let directed = await directFromChat({ text: last.text, attachments: [] });
        if (!directed && looksLikeChartRequest(last.text)) directed = await resolveChart(last.text);
        if (!directed && looksLikeMapRequest(last.text)) directed = await resolveMap(last.text);
        if (!cancelled && directed) showOnSphere(directed);
      } catch (err) {
        console.warn('[AXE] sphere director failed for user turn', err);
      }
    })();
    return () => { cancelled = true; };
  }, [voice.conversation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onScrollToApproval = () => {
      setChatCollapsed(false);
      requestAnimationFrame(() => {
        const el = chatScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    };
    window.addEventListener('axe-scroll-to-approval', onScrollToApproval);
    return () => window.removeEventListener('axe-scroll-to-approval', onScrollToApproval);
  }, []);

  useEffect(() => {
    const focusComposer = () => {
      const veld = document.querySelector<HTMLTextAreaElement>('.axe-vak-invoer');
      veld?.focus();
    };
    window.addEventListener('axe-focus-composer', focusComposer);
    return () => window.removeEventListener('axe-focus-composer', focusComposer);
  }, []);

  useEffect(() => {
    const action = voice.pendingAction;
    if (!action) return;
    if (action.kind === 'navigate') {
      const path = action.path || '';
      if (/maps|trading|chart/i.test(path)) {
        voice.clearPendingAction();
        return;
      }
      navigate(path);
    } else if (action.kind === 'open_url') {
      window.open(action.url, '_blank', 'noopener,noreferrer');
    }
    voice.clearPendingAction();
  }, [voice.pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Slepen geldt voor de hele plaat, niet voor één weergave.
   *
   * Dit hing aan het scene-vlak van Home, dus je kon alleen daar iets laten
   * vallen. Nu de chat op elke pagina staat, hoort dat ook: waar je ook bent,
   * een bestand erin slepen betekent hetzelfde.
   *
   * De listeners staan op window en niet op een element, omdat de plaat uit
   * losse vaste lagen bestaat (scene, panelen, chat, nav) en je anders per laag
   * moet bijhouden of de muis er nog boven zweeft. */
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setDropActive(true);
    };
    const verlaat = (e: DragEvent) => {
      // relatedTarget is null zodra de muis het venster verlaat; binnen het
      // venster vuurt dragleave ook bij elke grens tussen twee elementen.
      if (e.relatedTarget === null) setDropActive(false);
    };
    const los = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      setDropActive(false);
      void ingestFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', verlaat);
    window.addEventListener('drop', los);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', verlaat);
      window.removeEventListener('drop', los);
    };
  }); // geen deps: ingestFiles leest verse attachments

  const chatIsListening = voice.voiceStatus === 'listening';
  /* De mic-knop moet een gesprek op elk moment kunnen ophangen, niet alleen
     terwijl je zelf aan het woord bent. Vóór deze fix keek de knop alleen naar
     chatIsListening: klik hem in tijdens 'processing' of 'speaking' en
     startListening() deed niets (de loop draaide al, zie
     installWhisperVoice.ts), dus je zat vast tot AXE uitgesproken was.
     runConversationLoop zet voiceStatus terug naar 'idle' zodra het gesprek
     echt stopt, dus 'niet idle' is precies "gesprek loopt", ongeacht welke
     substatus. Zelfde fix nodig (en gedaan) in BottomBar.tsx, RightPanel.tsx
     en SidebarChat.tsx -- die hadden precies dezelfde aanname. */
  const chatGesprekActief = voice.voiceStatus !== 'idle';

  const showOnSphere = (proj: NonNullable<Awaited<ReturnType<typeof directFromChat>>>) => {
    setCoreView('axe');
    useSphereProjectionStore.getState().project(proj);
  };

  const ingestFiles = async (files: FileList | File[]) => {
    const next = await filesToAttachments(files, attachments);
    setAttachments(next);
    setChatCollapsed(false);
    emitAxeEvent('axe:files-attached', { names: next.map(a => a.name), count: next.length });
    const proj = projectionFromAttachments(next, 'drop');
    if (proj) showOnSphere(proj);
  };

  const handleChatSend = async () => {
    const t = chatText.trim();
    if (!t && attachments.length === 0) return;

    lastUserTextRef.current = t;

    if (voice.voiceStatus !== 'idle') voice.stopListening();
    const payload = buildCrewLaunchPrompt(t, attachments);
    setChatText('');
    setAttachments([]);
    /* Op de code-tab is de composer de vraag aan de code-agent — geen tweede
       balk, en AXE zelf hoeft dezelfde opdracht niet nóg eens te draaien. */
    if (location.pathname.includes('code-editor') && designAgentBridge.send(payload)) {
      return;
    }
    await voice.sendMessage(payload);
  };

  const handleChatMic = async () => {
    try { if (chatGesprekActief) await voice.stopListening(); else await voice.startListening(); } catch { /* ignore */ }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setDropActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDropActive(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    if (e.dataTransfer.files?.length) await ingestFiles(e.dataTransfer.files);
  };

  /* De plaat GROEIT MEE en staat niet op een vaste hoogte.
   *
   * Hij stond op 300px (48% op mobiel), leeg of vol. Dat is precies de loze
   * ruimte die je zag: een leeg gesprek nam 300px in beslag, de kopregel stond
   * bovenaan die leegte, en de composer eronder. In het voorbeeld zit die kop
   * vlak boven de composer.
   *
   * 'auto' laat hem krimpen tot wat erin staat en groeien tot het plafond
   * hieronder. Zo hoort hij zich te gedragen: leeg is leeg, en pas als er iets
   * gezegd is neemt hij ruimte.
   *
   * Het PLAFOND blijft nodig: zonder dat duwt een lang gesprek de composer van
   * het scherm. Dat staat als max-height in de css (.axe-chatplaat--kaal). */
  const expandedChatHeight = 'auto';
  const opEditor = location.pathname.includes('code-editor');
  const codeKop = useCodeAgentKop(s => s.kop);
  /* Op de Code Editor: alleen de kop, net als het ingeklapte gesprek op Home.
   * De composer gaat daar naar de code-agent (zie handleSend); de kop zegt dat,
   * met welke motor en in welke repo. Geen gespreksrol eronder -- het gesprek
   * met de agent staat in de editor zelf. */
  const [presenceNaastComposer, setPresenceNaastComposer] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setPresenceNaastComposer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* Desktop/tablet conversation lives BESIDE the composer in AxePresenceDock,
   * including Home. On narrow phones the dock is hidden, so the normal chat
   * history remains the fallback there. Code Editor keeps its own header
   * because it carries motor/repo context, not conversation. */
  const gesprekInPresence = presenceNaastComposer && !opEditor;
  const kopAlleen = gesprekInPresence || opEditor || chatCollapsed;
  /* Corrective round 6, Part 1: dit paneel (het gesprekken/status-paneel
   * achter de klok) hergebruikte `kopAlleen` en verdween daardoor op elke
   * normale-breedte pagina buiten de code editor -- `gesprekInPresence` is op
   * desktopbreedte vrijwel overal waar (presence staat naast de composer,
   * behalve op de editor), en `chatCollapsed` staat sinds AppShell op elke tab
   * behalve Home. Samen betekende dat: het paneel kon in de praktijk bijna
   * nooit tonen, ONGEACHT ronde 5 -- git log bevestigt dat `gesprekInPresence`
   * en `kopAlleen` letterlijk ongewijzigd zijn sinds vóór ronde 5; die ronde
   * verplaatste alleen WAAR het paneel rendert (van een sibling-blok naar
   * `composerPaneel` als prop van AxeComposerVak), niet de voorwaarde
   * eronder. Luka merkte nu iets op dat al langer stuk was, zichtbaar
   * geworden doordat de rest van de kop eindelijk klopt.
   *
   * Het paneel is een ANDER concern dan "staat het gesprek naast de composer"
   * (AxePresenceDock) of "is de chatgeschiedenis handmatig dicht"
   * (chatCollapsed) -- het is puur "kan de klok-knop iets laten zien", en die
   * hoort altijd te werken zolang er een klok-knop is. Alleen op de code
   * editor bestaat die knop niet (zie composerKop hieronder: die tak heeft
   * geen Clock-knop), dus dat blijft de enige echte uitsluiting. */
  const paneelBeschikbaar = !opEditor;
  /* Corrective round 5: hier stond nog `collapsedChatHeight` (72px), zodat de
   * ingeklapte plaat precies de koprij liet staan -- die koprij WAS toen het
   * enige wat er nog stond. Sinds de koprij verhuisd is naar binnen de
   * composer (zie AxeComposerVak, `kop`), is die 72px een lege, dichtgeklapte
   * doos zonder inhoud geworden: de kop staat er niet meer, en de berichten
   * staan al achter `!kopAlleen` verstopt. Dus is `kopAlleen` nu gewoon 0 --
   * er is niets meer om in deze plaat te tonen als de kop hem niet meer
   * bewoont, ongeacht WELKE van de drie redenen (presence, code editor,
   * handmatig dicht) `kopAlleen` liet worden. */
  const chatHeight = kopAlleen ? 0 : expandedChatHeight;

  /* De stand van de chat op <html>, zodat de panelen ernaast hem kennen.
   *
   * Ze staan in sloten en weten niets van deze component -- dat is met opzet zo
   * -- maar ze moeten wel meeklappen: klapt de chat in, dan wordt de hele band
   * onderin één rij balken, en dan horen alle drie de namen op dezelfde hoogte
   * te staan. Eén attribuut is genoeg; de rest is opmaak. */
  useEffect(() => {
    document.documentElement.dataset.chat = kopAlleen ? 'dicht' : 'open';
    return () => { delete document.documentElement.dataset.chat; };
  }, [kopAlleen]);

  /* Corrective round 5: de INHOUD van de koprij, niet meer de doos eromheen --
   * die doos (`.axe-vak-kop`) is verhuisd naar AxeComposerVak, als eerste rij
   * BINNEN `.axe-vak`. Zie de uitleg daar voor waarom: een losse doos ervoor
   * kon door de composer geraakt worden (ronde 1 Fix 5), een rij ERIN niet.
   * Links wie er praat, rechts drie kale icoonknoppen -- ongewijzigd, alleen
   * de plek waar het terechtkomt is anders. */
  const composerKop = opEditor ? (
    <>
      <span className="axe-kop-links">
        <span className="axe-kop-persona" style={{ color: 'var(--accent-cyan)', letterSpacing: '0.08em' }}>
          <Code2 size={13} /> CODE AGENT
        </span>
        <span className="axe-kop-streep" aria-hidden="true" />
        <span className="axe-kop-persona">{codeKop?.motor ?? '…'}</span>
      </span>
      <span className="axe-kop-rechts" style={{ gap: 10, fontSize: 11, color: 'var(--text-muted)' }}>
        {codeKop?.spoor && <span className="truncate" style={{ maxWidth: 320 }} title={codeKop.spoor}>{codeKop.spoor}</span>}
        {codeKop?.repo && (
          <span className="t-mono" title="De repo waar de bestanden en de agent in werken">
            {codeKop.repo}{codeKop.branch ? ` · ${codeKop.branch}` : ''}
          </span>
        )}
      </span>
    </>
  ) : (
    <>
      {/* AXE CORE staat helemaal links, met het bolletje ernaast: dat
          is de modelkeuze (klik erop) en tegelijk het teken dat er iets
          aanstaat. De modelnaam zelf zat hier vóór de titel en duwde die
          naar het midden; hij staat nu in de tooltip van het bolletje.

          Corrective round 6, Part 2: dit label ZOCHT eerst de titel van het
          huidige gesprek op (`voice.allConversations.find(...)`) en viel pas
          terug op 'AXE CORE' als die ontbrak. Gesprekken krijgen automatisch
          een titel van hun eerste uitwisseling, dus na een paar berichten
          stond hier bijna altijd die eerste zin in plaats van het merk --
          Luka wil dat dit ALTIJD 'AXE CORE' zegt. De echte titel is niet weg:
          hij staat als tooltip op dit label, en (ongewijzigd) als knoptekst
          in het gesprekken-paneel achter de klok (`axe-convs` hieronder). */}
      <span className="axe-kop-links">
        <span
          className="axe-kop-persona"
          title={voice.allConversations.find(c => c.id === voice.sessionId)?.title || undefined}
        >
          <Sparkles size={13} />
          AXE CORE
        </span>
        <span onClick={e => e.stopPropagation()}>
          <ChatModelKiezer variant="stip" />
        </span>
      </span>

      <span className="axe-kop-rechts">
        <button onClick={() => setPaneelOpen(v => !v)} title="Gesprekken en status" aria-expanded={paneelOpen}>
          <Clock size={15} />
        </button>
        <button onClick={() => navigate('/settings')} title="Instellingen">
          <SlidersHorizontal size={15} />
        </button>
        {/* Geen inklap-pijltje meer. Het was de laatste knop die de chat
            kon dichtklappen -- Home deed dat eerder automatisch en dat is
            er al af -- dus er is niets meer dat hem dicht zet, en een
            knop die alleen iets kan aanzetten dat je nooit wil is
            chroom. De stand zelf (chatDicht) blijft bestaan: de
            driehoek van de radiaal-dok zet hem terug open als iets hem
            ooit toch dicht zet. */}
      </span>
    </>
  );

  /* Achter de klok: de gesprekken en de status. Eén paneel in plaats van vier
   * dingen op de kopregel.
   *
   * Blijft een uitzondering op "alles zit nu in het vak": dit paneel moet
   * BOVEN de composer kunnen uitklappen zonder het invoerveld te verschuiven,
   * dus gaat hij als aparte, absoluut gepositioneerde laag mee (zie `paneel`
   * op AxeComposerVak en `.axe-kop-paneel` in axe-look.css) in plaats van als
   * inhoud van `.axe-vak-kop` zelf.
   *
   * Corrective round 6, Part 1: de voorwaarde is HIER wel gewijzigd, van
   * `!kopAlleen` naar `paneelBeschikbaar` (== `!opEditor`) -- zie de uitleg bij
   * die variabele hierboven. `!kopAlleen` was zelf nooit het probleem van
   * ronde 5, maar wel de reden dat dit paneel al van vóór ronde 5 af
   * nauwelijks bereikbaar was op elke gewone tab. De CSS-kant is nagekeken en
   * niet de oorzaak: `.axe-composer` heeft `position: relative` en geen eigen
   * `overflow`, dus `.axe-kop-paneel`'s `position: absolute; bottom: 100%`
   * landt gewoon zichtbaar erboven; de enige `overflow: hidden` in de
   * voorouderketen zit op `.axe-shell` zelf (de volle-viewport-hoogte
   * wrapper), ver genoeg weg van een composer onderin het scherm om dit
   * paneel (~100-150px) niet af te snijden. */
  const composerPaneel = paneelOpen && paneelBeschikbaar && (
    <div className="axe-kop-paneel">
      <span className="axe-cpills"><MissionControlStrip /></span>
      <span className="axe-cstat">
        <span className="flex items-center gap-1"><MapPin size={10} />NL</span>
        <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}><Wifi size={10} />Online</span>
        {voice.apiKeyValid === true && <span style={{ color: 'var(--success)' }}>API OK</span>}
        {attachments.length > 0 && (
          <span style={{ color: 'var(--accent-cyan)' }}>
            {attachments.length} file{attachments.length > 1 ? 's' : ''}
          </span>
        )}
      </span>
      <span className="axe-convs">
        {voice.allConversations.slice(0, 6).map(conv => (
          <button
            key={conv.id}
            onClick={() => voice.switchConversation(conv.id)}
            className="axe-conv"
            data-nu={conv.id === voice.sessionId ? 'ja' : 'nee'}
          >
            {conv.title}
          </button>
        ))}
      </span>
      <button onClick={() => voice.loadAllConversations()} title="Verversen" className="axe-kop-mini">
        <RotateCcw size={12} />
      </button>
      <button onClick={() => voice.startNewConversation()} title="Nieuw gesprek" className="axe-kop-mini">
        <Plus size={12} />
      </button>
    </div>
  );

  return (
    <>
      {/* Wat je ziet als je een bestand boven de app houdt. Over de hele plaat,
          want je mag het overal loslaten. */}
      {dropActive && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="rounded-2xl px-6 py-4 text-center"
            style={{ border: '1px dashed var(--tint-line)', background: 'var(--tint-line)' }}>
            <div className="text-[13px] font-medium" style={{ color: 'var(--accent-cyan)' }}>Drop any file into AXE</div>
          </div>
        </div>
      )}
      <motion.div variants={iv} className="flex-shrink-0 flex flex-col" animate={{ height: chatHeight }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <div
          data-dicht={kopAlleen ? 'ja' : 'nee'}
          className="axe-chatplaat axe-chatplaat--kaal h-full flex flex-col relative"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => { void onDrop(e); }}
        >
          {/* Corrective round 5: de koprij en het klok-paneel woonden hier
              (`.axe-vak-kop`, `.axe-kop-paneel`, beide siblings van de
              composer) -- ze zijn verhuisd naar `composerKop`/`composerPaneel`
              hierboven, die AxeComposerVak als `kop`/`paneel` binnenkrijgt en
              nu ECHT in het vak zelf tekent. Zie de uitleg daar. */}
          {!kopAlleen && (
            <>
              <div ref={chatScrollRef} className="axe-chatrol overflow-y-auto px-2.5 py-2 space-y-1.5 min-h-0">
                {voice.conversation.map((m, i) => {
                  const isUser = m.role === 'user';
                  const displayText = isUser && (m.text.includes('## Attached files') || m.text.includes('LAUNCH CREWAI'))
                    ? (m.text.includes('LAUNCH CREWAI') ? 'Launch CrewAI · attached brief' : m.text.split('## Attached files')[0].trim() || 'Attached file(s)')
                    : m.text;
                  return (
                    <div key={i} className={`flex gap-1.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Een stip, geen icoontje: cyaan als AXE praat, oranje als jij
                          het bent. Twee poppetjes naast elkaar zeggen alleen "mens" en
                          "robot"; twee kleuren zeggen wie er aan het woord is, en dat
                          lees je zonder ernaar te kijken. */}
                      <span
                        className="axe-dot mt-1.5 flex-shrink-0"
                        data-van={isUser ? 'mij' : 'axe'}
                        aria-hidden="true"
                      />
                      <div className="max-w-[85%] flex flex-col gap-0.5">
                        <div className="axe-bubbel rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed" data-van={isUser ? 'mij' : 'axe'} style={{ background: isUser ? 'var(--tint)' : 'rgba(255,255,255,0.04)', color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.85)' }}>
                          {isUser ? displayText : <MarkdownMessage text={m.text} />}
                        </div>
                        {!isUser && m.provider && m.provider !== 'none' && (
                          m.provider === 'error' ? (
                            <div className="flex items-start gap-0.5 px-1" style={{ color: 'rgba(239,68,68,0.55)' }}>
                              <AlertTriangle size={9} className="mt-px" />
                              <span className="text-[8px] leading-tight">{m.slotErrors ? m.slotErrors : 'all providers failed'}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 px-1" style={{ color: 'rgba(255,255,255,0.22)' }}>
                              <Zap size={8} />
                              <span className="text-[8px]">{m.provider}{m.model ? ` · ${m.model.split('/').pop()?.split(':')[0]}` : ''}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {voice.pendingExec && (
                <div className="mx-2.5 mb-2 p-2.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)' }}>
                  <div className="flex items-center gap-1.5 mb-1.5" style={{ color: 'rgb(251,146,60)' }}>
                    <Terminal size={12} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{voice.pendingExec.title}</span>
                  </div>
                  <pre className="block text-[11px] px-2 py-1.5 rounded mb-2 whitespace-pre-wrap break-all max-h-40 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.4)', color: 'var(--text-primary)' }}>
                    {voice.pendingExec.detail}
                  </pre>
                  <div className="flex gap-1.5">
                    <button onClick={() => voice.resolvePendingExec(voice.pendingExec!.id, true)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md" style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
                      <Check size={12} /> Approve
                    </button>
                    <button onClick={() => voice.resolvePendingExec(voice.pendingExec!.id, false)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md" style={{ background: 'rgba(239,68,68,0.1)', color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <X size={12} /> Deny
                    </button>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </motion.div>
      {/* De composer staat ONDER de chatplaat, niet erin.
          In de demo zijn dat twee losse dingen: de plaat met het gesprek,
          en daaronder de pil waarin je typt. Hier zat hij binnenin, wat twee
          dingen brak -- hij verdween zodra je de chat inklapte (in de demo
          blijft hij staan), en hij kreeg de breedte van de plaat MIN de
          padding, dus hij was altijd smaller dan de plaat erboven. */}
      {/* De composer hangt VAST aan de chatplaat: één blok, geen twee dozen
          boven elkaar. Zie .axe-vakcomposer in design/axe-look.css.

          De rij eronder is die van het voorbeeld, met de functies die deze app
          echt heeft -- een icoon hoort te doen wat hij tekent. Links het
          gereedschap, rechts opnemen/spreken/versturen, en de toverstaf
          rechtsboven is de prompt-kiezer (de "/prompts" uit de placeholder). */}
      <AxeComposerVak
        waarde={chatText}
        opWaarde={setChatText}
        opVerstuur={() => void handleChatSend()}
        plaatshouder={attachments.length ? 'Send · show · chart · done' : 'Ask anything, @models, /prompts …'}
        snelacties={!isMobile && (opEditor || !chatCollapsed)}
        snelactieLijst={opEditor ? codeKop?.snelacties : undefined}
        staf={<VermogensKnop onKies={t => setChatText(t)} />}
        kop={composerKop}
        paneel={composerPaneel}
        links={
          <>
            <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
            {/* Spreekt AXE terug of typt hij. Op mobiel weg: die rij is daar al
                vol, en dit is een voorkeur, geen actie. */}
            {!isMobile && (
              <button
                onClick={() => voice.setResponseMode(voice.responseMode === 'speak' ? 'type' : 'speak')}
                title={voice.responseMode === 'speak' ? 'AXE praat terug' : 'Alleen tekst'}
              >
                {voice.responseMode === 'speak' ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            )}
            {/* Diep onderzoek: zet het voorvoegsel klaar in plaats van meteen
                iets te starten. Een knop die ongevraagd een onderzoek afvuurt
                kost tokens zonder dat je erom vroeg. */}
            <button onClick={() => setChatText(t => (t.startsWith('/research') ? t : `/research ${t}`))} title="Diep onderzoek">
              <Telescope size={18} />
            </button>
            <button onClick={() => navigate('/browser')} title="Zoek op het web">
              <Globe size={18} />
            </button>
          </>
        }
        rechts={
          <>
            <VisionCaptureButton compact />
            <button onClick={handleChatMic} title="Spreek" style={chatIsListening ? { color: 'var(--accent-cyan)' } : undefined}>
              <Mic size={18} />
            </button>
            <button onClick={() => void handleChatSend()} disabled={!chatText.trim() && attachments.length === 0} title="Versturen">
              <Send size={16} />
            </button>
          </>
        }
      />
    </>
  );
}
