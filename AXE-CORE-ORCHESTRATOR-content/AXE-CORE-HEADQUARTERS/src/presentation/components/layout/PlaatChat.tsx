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
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Plus, Send, Mic, RotateCcw, ChevronDown, ChevronUp, Zap, Volume2, VolumeX, Terminal, Check, X, MapPin, Wifi } from 'lucide-react';
import { HomeChatComposer } from '@/presentation/components/axe-core/HomeChatComposer';
import { MissionControlStrip } from '@/presentation/components/axe-core/MissionControlStrip';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';
import { VisionCaptureButton } from '@/presentation/components/voice/VisionCaptureButton';
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

const iv = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as never } } };

function looksLikeMapRequest(t: string): boolean {
  return /\b(kaart|map|maps|locatie|city|stad)\b/i.test(t)
    || /laat(\s+\S+){1,8}\s+zien/i.test(t)
    || /\b(new\s*york|nyc|tokyo|london|paris|amsterdam|dubai|singapore|berlin)\b/i.test(t);
}
function looksLikeChartRequest(t: string): boolean {
  return /\b(chart|grafiek|graph|plot|trading|btc|eth|koers)\b/i.test(t);
}

export function PlaatChat() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const voice = useVoiceStore();
  const dismiss = useSphereProjectionStore(s => s.dismiss);
  const setCoreView = useCoreViewStore(s => s.setCoreView);
  const chatCollapsed = useCoreViewStore(s => s.chatDicht);
  const setChatCollapsed = useCoreViewStore(s => s.setChatDicht);

  const [chatText, setChatText] = useState('');
  const [attachments, setAttachments] = useState<NormalizedAttachment[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastProjectedMsgRef = useRef<string>('');
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

    if (shouldDismissProjection(t)) {
      dismiss();
      setChatText('');
      return;
    }

    lastUserTextRef.current = t;

    try {
      let directed = await directFromChat({ text: t, attachments });
      if (!directed && looksLikeChartRequest(t)) {
        directed = await resolveChart(t);
      }
      if (!directed && looksLikeMapRequest(t)) {
        directed = await resolveMap(t);
      }
      // Ultimate fallback: any "laat … zien" / "show …" → map resolve
      if (!directed && (/laat(\s+\S+){1,10}\s+zien/i.test(t) || /\b(show|toon)\s+/i.test(t))) {
        directed = await resolveMap(t);
      }
      if (directed) {
        showOnSphere(directed);
      } else {
        console.warn('[Home] no sphere projection resolved for:', t);
      }
    } catch (err) {
      console.warn('[Home] sphere director failed', err);
    }

    const payload = buildCrewLaunchPrompt(t, attachments);
    setChatText('');
    setAttachments([]);
    await voice.sendMessage(payload);
  };

  const handleChatMic = async () => {
    try { if (chatIsListening) await voice.stopListening(); else await voice.startListening(); } catch { /* ignore */ }
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

  const expandedChatHeight = isMobile ? '48%' : 300;
  /* 72px, en dat is exact wat de panelen ernaast krijgen.
   *
   * De sloten lopen van de bovenkant van deze plaat tot de onderkant van de
   * composer. Trek daar de tussenruimte en de composer vanaf en je houdt
   * precies deze hoogte over -- mits de plaat en het slot dezelfde tussenruimte
   * gebruiken. Dat was het verschil: ingeklapt had de plaat er 14px marge
   * bovenop, dus werd het paneel 14px hoger dan de balk. Die marge is weg (zie
   * axe-look.css), dus nu volgt de een uit de ander in plaats van dat twee
   * getallen toevallig gelijk moeten staan. */
  const collapsedChatHeight = 72;
  const chatHeight = chatCollapsed ? collapsedChatHeight : expandedChatHeight;

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
          data-dicht={chatCollapsed ? 'ja' : 'nee'}
          className="axe-chatplaat h-full flex flex-col rounded-xl overflow-hidden relative"
          style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.06)' }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => { void onDrop(e); }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => setChatCollapsed(!chatCollapsed)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChatCollapsed(!chatCollapsed); } }}
            className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 w-full text-left cursor-pointer"
            style={{ borderBottom: chatCollapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide" style={{ color: 'var(--accent-cyan)' }}>
              {chatCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              AXE CHAT
              {attachments.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--tint)', color: 'var(--accent-cyan)' }}>
                  {attachments.length} file{attachments.length > 1 ? 's' : ''}
                </span>
              )}
              {/* De tellers stonden als losse pillen BOVEN de plaat, en dat is
                  waarom er een rij zwevende doosjes tussen de scene en de chat
                  hing. In de demo staan ze op dezelfde regel als de naam, ín de
                  kop, gescheiden door een streepje in plaats van door een
                  kader: het zijn tellers, geen knoppen. */}
              <span className="axe-cpills" onClick={e => e.stopPropagation()}>
                <MissionControlStrip />
              </span>
              {/* Waar je bent en of de verbinding staat. Dit stond boven de
                  composer, waardoor die twee regels hoog was en op elke tab
                  anders. Hier staat het bij de rest van de status, op één
                  lijn. */}
              <span className="axe-cstat hidden lg:flex items-center gap-2.5">
                <span className="flex items-center gap-1"><MapPin size={10} />NL</span>
                <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
                  <Wifi size={10} />Online
                </span>
                {voice.apiKeyValid === true && (
                  <span style={{ color: 'var(--success)' }}>API OK</span>
                )}
              </span>
            </span>
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              {/* De gesprekken stonden op een eigen regel ONDER de kop, met een
                  streep eronder -- twee regels chroom voordat het gesprek zelf
                  begon. Ze horen op de kopregel: het is dezelfde informatie
                  ("welk gesprek kijk je"), en de demo heeft daar één lijn. */}
              {!chatCollapsed && voice.allConversations.length > 1 && (
                <span className="axe-convs flex items-center gap-1 overflow-x-auto">
                  {voice.allConversations.slice(0, 4).map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => voice.switchConversation(conv.id)}
                      className="axe-conv flex-shrink-0 truncate max-w-[110px]"
                      data-nu={conv.id === voice.sessionId ? 'ja' : 'nee'}
                    >
                      {conv.title}
                    </button>
                  ))}
                </span>
              )}
              {!chatCollapsed && voice.allConversations.length > 0 && (
                <button onClick={() => voice.loadAllConversations()} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                  <RotateCcw size={11} />
                </button>
              )}
              {!chatCollapsed && (
                <button onClick={() => voice.startNewConversation()} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}>
                  <Plus size={9} /> New
                </button>
              )}
            </div>
          </div>

          {!chatCollapsed && (
            <>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5 min-h-0">
                {voice.conversation.length === 0 && (
                  <div className="h-full flex items-center justify-center text-center px-4">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      “show chart” · “show me New York” · drop files · “done”
                    </span>
                  </div>
                )}
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
                              <span className="text-[8px] mt-px">⚠</span>
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
              <HomeChatComposer>
                    <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
                    {/* Speak/text toggle dropped on mobile: five icon buttons plus
                        the input squeezed the input down to ~150px on a 375px
                        screen, clipping even a short placeholder — this is the
                        least essential of the row, a preference toggle rather
                        than an action. */}
                    {!isMobile && (
                      <button onClick={() => voice.setResponseMode(voice.responseMode === 'speak' ? 'type' : 'speak')} className="flex-shrink-0 rounded-md p-2" title={voice.responseMode === 'speak' ? 'AXE speaks back' : 'Text-only'} style={{ background: voice.responseMode === 'speak' ? 'var(--tint-line)' : 'rgba(255,255,255,0.04)', color: voice.responseMode === 'speak' ? 'var(--accent-cyan)' : 'var(--text-muted)', border: `1px solid ${voice.responseMode === 'speak' ? 'var(--tint-line)' : 'rgba(255,255,255,0.06)'}` }}>
                        {voice.responseMode === 'speak' ? <Volume2 size={13} /> : <VolumeX size={13} />}
                      </button>
                    )}
                    <button onClick={handleChatMic} className="flex-shrink-0 rounded-md p-2" style={{ background: chatIsListening ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)', color: chatIsListening ? '#000' : 'var(--text-muted)' }}>
                      <Mic size={13} />
                    </button>
                    <VisionCaptureButton compact className="flex-shrink-0 rounded-md p-2 border-0 bg-white/5 text-white/50 hover:bg-white/10 disabled:opacity-50" />
                    <input
                      value={chatText}
                      onChange={e => setChatText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleChatSend(); }}
                      placeholder={attachments.length ? 'Send · show · chart · done' : (isMobile ? 'Ask anything…' : 'show chart · show me New York')}
                      className="flex-1 min-w-0 text-[13px] px-3 py-2 rounded-lg outline-none bg-transparent"
                      style={{ color: 'var(--text-primary)', border: 'none' }}
                    />
                    <button onClick={() => void handleChatSend()} disabled={!chatText.trim() && attachments.length === 0} className="flex-shrink-0 rounded-md p-2 disabled:opacity-40" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                      <Send size={13} />
                    </button>
              </HomeChatComposer>
    </>
  );
}
