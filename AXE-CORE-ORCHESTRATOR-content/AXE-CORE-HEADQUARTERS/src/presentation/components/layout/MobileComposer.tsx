/**
 * MobileComposer — the real AXE composer, wired to the same voice/task store
 * as desktop. Mobile owns its layout, not a second assistant implementation.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Clock,
  Globe,
  Mic,
  Plus,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Telescope,
} from 'lucide-react';
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

export function MobileComposer() {
  const navigate = useNavigate();
  const voice = useVoiceStore();
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<NormalizedAttachment[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    void voice.loadAllConversations();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;

    const payload = buildCrewLaunchPrompt(text, attachments);
    if (voice.voiceStatus !== 'idle') voice.stopListening();
    setDraft('');
    setAttachments([]);
    await voice.sendMessage(payload);
    navigate('/mobile');
  }, [attachments, draft, navigate, voice]);

  const mic = useCallback(async () => {
    try {
      if (voice.voiceStatus !== 'idle') voice.stopListening();
      else await voice.startListening();
    } catch {
      // The canonical voice store already exposes the useful mic error.
    }
  }, [voice]);

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
        title="Verversen"
        className="axe-kop-mini"
      >
        <RotateCcw size={12} />
      </button>
      <button
        onClick={() => {
          voice.startNewConversation();
          setHistoryOpen(false);
        }}
        title="Nieuw gesprek"
        className="axe-kop-mini"
      >
        <Plus size={12} />
      </button>
    </div>
  ) : null;

  const activeVoice = voice.voiceStatus !== 'idle';

  return (
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
          <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
          <button
            type="button"
            onClick={() => setDraft(t => (t.startsWith('/research') ? t : `/research ${t}`))}
            title="Diep onderzoek"
          >
            <Telescope size={18} />
          </button>
          <button type="button" onClick={() => navigate('/browser')} title="Browser">
            <Globe size={18} />
          </button>
        </>
      }
      rechts={
        <>
          <VisionCaptureButton compact />
          <button
            type="button"
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
          <button
            type="button"
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
}
