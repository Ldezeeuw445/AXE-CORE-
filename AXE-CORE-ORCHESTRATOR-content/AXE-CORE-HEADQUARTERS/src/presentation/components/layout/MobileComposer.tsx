/**
 * MobileComposer — the real AXE composer, wired to the same voice/task store
 * as desktop. Mobile owns its layout, not a second assistant implementation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  Clock,
  Globe,
  Keyboard,
  Mic,
  CornerUpLeft,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Telescope,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { isHoofdgesprek } from '@/domain/chat/hoofdgesprek';
import { AxeComposerVak } from '@/presentation/components/layout/AxeComposerVak';
import { ChatModelKiezer } from '@/presentation/components/layout/ChatModelKiezer';
import { VermogensKnop } from '@/presentation/components/layout/VermogensKnop';
import {
  FileUploadButton,
  buildCrewLaunchPrompt,
  type NormalizedAttachment,
} from '@/presentation/components/axe-core/FileUploadButton';
import { VisionCaptureButton } from '@/presentation/components/voice/VisionCaptureButton';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { neemDeelTekst, DEEL_GEBEURTENIS } from '@/presentation/store/installDeelDoel';
import { useUIStore } from '@/presentation/store/uiStore';
import { skillDef } from '@/domain/tierRouter/axeSkills';

/* Zette tot 1 okt 2026 `/research` klaar. Dat voorvoegsel las niemand: geen
   route parseert het, en het matchte ook niet met de deep-research-skill (die
   wil "deep research"). Nu komt de aanroep uit axeSkills.ts, zodat de knop en de
   getypte zin bij dezelfde skill uitkomen. Hij vult vóór en vuurt niet -- dat was
   een bewuste keuze: een knop die ongevraagd onderzoek afvuurt kost tokens. */
const DIEP_ONDERZOEK = skillDef('deep-research')!;

interface Props {
  navigateAfterSend?: boolean;
  /** Alleen de telefoon-tabs (AppShell): smal als dock in plaats van het volle vak. */
  dock?: boolean;
  opDock?: (dock: boolean) => void;
}

export function MobileComposer({ navigateAfterSend = true, dock = false, opDock }: Props = {}) {
  const navigate = useNavigate();
  const vakRef = useRef<HTMLDivElement | null>(null);
  const voice = useVoiceStore();
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<NormalizedAttachment[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    void voice.loadAllConversations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Gedeeld vanuit een andere app? Dan staat het hier klaar.
  //
  // Twee wegen, want een deling kan vóór of ná deze composer binnenkomen:
  // bij het openen parkeert installDeelDoel de tekst (React bestaat dan nog
  // niet), en staat de app al open, dan komt hij als gebeurtenis binnen.
  // Aanvullen in plaats van overschrijven: wat je al aan het typen was is van
  // jou.
  useEffect(() => {
    const zet = (tekst: string) => {
      setDraft((d) => (d.trim() ? `${d.trimEnd()}\n\n${tekst}` : tekst));
    };
    const geparkeerd = neemDeelTekst();
    if (geparkeerd) zet(geparkeerd);

    const op = (e: Event) => {
      const tekst = (e as CustomEvent<string>).detail;
      if (typeof tekst === 'string' && tekst.trim()) zet(tekst);
    };
    window.addEventListener(DEEL_GEBEURTENIS, op);
    return () => window.removeEventListener(DEEL_GEBEURTENIS, op);
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;

    const payload = buildCrewLaunchPrompt(text, attachments);
    if (voice.voiceStatus !== 'idle') voice.stopListening();
    setDraft('');
    setAttachments([]);
    await voice.sendMessage(payload);
    if (navigateAfterSend) navigate('/mobile');
  }, [attachments, draft, navigate, navigateAfterSend, voice]);

  const mic = useCallback(async () => {
    try {
      if (voice.voiceStatus !== 'idle') voice.stopListening();
      else await voice.startListening();
    } catch {
      // The canonical voice store already exposes the useful mic error.
    }
  }, [voice]);

  /* Een bestand toevoegen vanuit de dock opent het volle vak: een bijlage
     verstuur je met tekst erbij, en de verzendknop zit daar. */
  const kiesBijlagen = useCallback((lijst: NormalizedAttachment[]) => {
    setAttachments(lijst);
    if (dock && lijst.length > attachments.length) opDock?.(false);
  }, [attachments.length, dock, opDock]);

  /* Het toetsenbord in de dock. flushSync zet het vak er in dezelfde tik neer,
     zodat focus() nog binnen het tikgebaar valt -- anders opent iOS het
     toetsenbord niet. */
  const typen = () => {
    flushSync(() => opDock?.(false));
    vakRef.current?.querySelector('textarea')?.focus();
  };

  const header = (
    <>
      <span className="axe-kop-links">
        <span className="axe-kop-persona">
          <Sparkles size={13} />
          AXE CORE
        </span>
        <span onClick={e => e.stopPropagation()}>
          <ChatModelKiezer variant="stip" />
        </span>
      </span>
      <span className="axe-kop-rechts">
        <button
          type="button"
          onClick={() => setHistoryOpen(v => !v)}
          title="Gespreksgeschiedenis"
          className="axe-kop-mini"
        >
          <Clock size={14} />
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          title="Instellingen"
          className="axe-kop-mini"
        >
          <SlidersHorizontal size={14} />
        </button>
      </span>
    </>
  );

  const history = historyOpen ? (
    <div className="axe-kop-paneel">
      <span className="axe-convs">
        {voice.allConversations.slice(0, 6).map(conv => (
          <button
            key={conv.id}
            onClick={() => {
              void voice.switchConversation(conv.id);
              setHistoryOpen(false);
            }}
            className="axe-conv"
            data-nu={conv.id === voice.sessionId ? 'ja' : 'nee'}
          >
            {conv.title}
          </button>
        ))}
      </span>
      <button
        onClick={() => voice.loadAllConversations()}
        title="Refresh"
        className="axe-kop-mini"
      >
        <RotateCcw size={12} />
      </button>
      {/* Eén doorlopend gesprek: alleen terug-knop vanuit het archief. */}
      {!isHoofdgesprek(voice.sessionId) && (
        <button
          onClick={() => {
            voice.startNewConversation();
            setHistoryOpen(false);
          }}
          title="Back to AXE"
          className="axe-kop-mini"
        >
          <CornerUpLeft size={12} />
        </button>
      )}
    </div>
  ) : null;

  const activeVoice = voice.voiceStatus !== 'idle';

  const stemKnop = (
    <button
      type="button"
      onClick={() => voice.setResponseMode(voice.responseMode === 'speak' ? 'type' : 'speak')}
      title={voice.responseMode === 'speak' ? 'AXE praat terug' : 'Alleen tekst'}
      aria-label={voice.responseMode === 'speak' ? 'AXE praat terug' : 'Alleen tekst'}
    >
      {voice.responseMode === 'speak' ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );

  const micKnop = (
    <button
      type="button"
      className="axe-mobile-mic"
      onClick={() => { void mic(); }}
      title={activeVoice ? 'Stop gesprek' : 'Praat met AXE'}
      aria-pressed={activeVoice}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        color: activeVoice ? '#001018' : 'white',
        background: activeVoice
          ? 'var(--accent-cyan)'
          : 'radial-gradient(circle at 40% 35%, rgba(34,211,238,.35), rgba(79,70,229,.32) 55%, rgba(9,11,13,.96) 100%)',
        border: '1px solid rgba(103,232,249,.52)',
        boxShadow: activeVoice
          ? '0 0 22px rgba(34,211,238,.45)'
          : '0 0 16px rgba(59,130,246,.22)',
      }}
    >
      <Mic size={22} />
    </button>
  );

  /* De dock (Luka, 2 okt, optie B uit de artifact "Slanke Composer"): op de
     andere tabs klapt de composer niet meer helemaal weg maar wordt hij een
     eiland met alleen knoppen. Spraak in het midden, één tik. Dit is dezelfde
     component, dus een half getypt bericht en de bijlagen blijven staan. */
  if (opDock && dock) {
    return (
      <div className="axe-mobile-dock-rij axe-mobile-composer-in">
        <div className="axe-mobile-dock" role="toolbar" aria-label="AXE">
          <FileUploadButton attachments={attachments} onAttachmentsChange={kiesBijlagen} />
          <VisionCaptureButton compact />
          {micKnop}
          {stemKnop}
          <span className="axe-mobile-dock-streep" aria-hidden="true" />
          <button type="button" onClick={typen} title="Typen" aria-label="Typen">
            <Keyboard size={18} />
          </button>
        </div>
      </div>
    );
  }

  const vak = (
    <AxeComposerVak
      waarde={draft}
      opWaarde={setDraft}
      opVerstuur={() => { void send(); }}
      plaatshouder={attachments.length ? 'Send · show · chart · done' : 'Ask anything, @models, /prompts …'}
      staf={<VermogensKnop onKies={t => setDraft(t)} />}
      kop={header}
      paneel={history}
      toonAgentsBalk={false}
      links={
        <>
          <FileUploadButton attachments={attachments} onAttachmentsChange={kiesBijlagen} />
          <button
            type="button"
            onClick={() => setDraft(t => (DIEP_ONDERZOEK.patroon.test(t) ? t : `${DIEP_ONDERZOEK.label} ${t}`))}
            title={DIEP_ONDERZOEK.uitleg}
          >
            <Telescope size={18} />
          </button>
          <button type="button" onClick={() => navigate('/browser')} title="Browser">
            <Globe size={18} />
          </button>
          {/* De vijf skills. Ze stonden sinds 1 okt in het commandopalet en in een
              pil in MobileFab -- en die FAB hangt aan `!opPlaatMobiel`, wat op de
              telefoon waar is op élke route behalve het slotscherm. De pil was dus
              onbereikbaar. Hier wel: deze composer staat op élke mobiele tab, en
              het is ook de plek waar je met AXE praat, dus waar je om werk vraagt. */}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            title="Skills — Plan Today, Inbox Brief, Intel Brief, Deep Research, Weekly Review"
            aria-label="Skills"
          >
            <Sparkles size={18} />
          </button>
        </>
      }
      rechts={
        <>
          <VisionCaptureButton compact />
          {/* Spraak aan/uit. Stond alleen in PlaatChat achter `{!isMobile && ...}`,
              dus de telefoon kon AXE's stem nooit uitzetten -- en dat is juist het
              oppervlak waar je dat wilt kunnen (in de trein, naast iemand). Zelfde
              store-actie, zelfde titels als het bureau. */}
          {stemKnop}
          {micKnop}
          <button
            type="button"
            className="axe-mobile-send"
            onClick={() => { void send(); }}
            disabled={!draft.trim() && attachments.length === 0}
            title="Versturen"
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg,#22d3ee,#0891b2)',
              color: '#001018',
            }}
          >
            <Send size={15} />
          </button>
        </>
      }
    />
  );

  // Alleen op de tabs een omhulsel: daar zoekt `typen` het veld, en schuift het vak in.
  return opDock ? <div ref={vakRef} className="axe-mobile-composer-in">{vak}</div> : vak;
}
