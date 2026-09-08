import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, ImagePlus, Mic, Send, Settings } from 'lucide-react';
import { Panel, IconButton } from '@/presentation/components/surface/Surface';
import type { AIMessage } from '@/domain/types/browser';
import type { AIConfig } from '@/presentation/hooks/useAIConfig';

/** Lazy — keeps postprocessing/three stage code out of initial browser paint */
const AxeCoreSphere = lazy(
  // Dezelfde bol als op Home. De browser had een eigen variant
  // (FloatingParticleSphere), waardoor AXE er per tab anders uitzag.
  () => import('@/presentation/components/axe-core/sphere/AxeCoreSphere').then(m => ({ default: m.AxeCoreSphere })),
);

interface AxeFloatingPresenceProps {
  visible: boolean;
  messages: AIMessage[];
  onSendMessage: (content: string) => void;
  aiConfig: AIConfig;
  onOpenSettings: () => void;
  isLoading?: boolean;
}

export function AxeFloatingPresence({
  visible,
  messages,
  onSendMessage,
  aiConfig: _aiConfig,
  onOpenSettings,
  isLoading = false,
}: AxeFloatingPresenceProps) {
  const [inputValue, setInputValue] = useState('');
  const [sphereVisible, setSphereVisible] = useState(false);
  const [sphereReady, setSphereReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hier stond een effect dat een 'thinking'-stand bijhield voor de oude
  // FloatingParticleSphere. Home's bol kent die stand niet -- dat het aan het
  // denken is, blijkt uit de stippen onder de tekst. Een stand bijhouden die
  // niemand leest is precies hoe je gaat geloven dat er iets gebeurt.

  // Defer WebGL until panel is open + idle (prevents tab crash on load)
  useEffect(() => {
    if (!visible) {
      setSphereReady(false);
      setSphereVisible(false);
      return;
    }
    setSphereVisible(true);
    const id = window.setTimeout(() => setSphereReady(true), 400);
    return () => window.clearTimeout(id);
  }, [visible]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!visible) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
    setSphereVisible(true);
    setSphereReady(true);
  };

  const showChat = messages.length > 0;

  return (
    <>
      {/* ── Bol en tekst in ÉÉN stapel ────────────────────────────────────
       *
       * Het waren twee losse `fixed` blokken: de bol rechtsonder, de tekst
       * daarboven op een uitgerekende hoogte (5.5rem + 180px + 0.5rem). Die
       * rekensom klopt alleen zolang de bol precies 180px blijft, en de tekst
       * stond bovendien aan de verkeerde kant -- Luka wil hem ONDER de bol.
       *
       * Eén kolom die vanaf de onderrand stapelt lost allebei op: de bol
       * bovenin, de tekst eronder, en geen enkele hoogte om bij te houden.
       * Iets verder van de rand dan de 6 die er stond. */}
      <div
        /* items-center, niet items-end: de tekst hoort onder de bol te staan
           en er even breed omheen te vallen. Met items-end schoof de tekst naar
           de rechterrand en stond de bol er scheef boven.

           max-h zorgt dat de bovenkant van de bol nooit hoger komt dan waar de
           rechter schuifbalk begint -- die start onder de kopbalk, dus 5rem
           speling houdt hem daar netjes onder in plaats van ertegenaan. */
        className={`fixed bottom-[5.5rem] right-10 z-40 flex flex-col items-center gap-3 w-[min(340px,calc(100%-2rem))] max-h-[calc(100dvh-5rem-5.5rem)] transition-all duration-700 ease-[cubic-bezier(.2,.9,.3,1)] ${
          sphereVisible && sphereReady ? 'translate-y-0 opacity-100' : 'translate-y-[120%] opacity-0 pointer-events-none'
        }`}
      >
        {/* Geen vak. Het was een blok van 180x180 met een eigen achtergrond;
            op Home staat de bol gewoon op de plaat, zonder omhulsel. Alleen de
            maat blijft nodig, want een canvas zonder maat is nul groot. */}
        <div className="relative w-[220px] h-[220px] shrink-0">
          {sphereVisible && sphereReady && (
            <Suspense fallback={null}>
              <AxeCoreSphere />
            </Suspense>
          )}
          <button
            type="button"
            onClick={() => setSphereVisible(false)}
            className="absolute -top-2 -left-2 z-10 w-7 h-7 flex items-center justify-center text-axe-text-muted/70 hover:text-axe-accent-cyan transition-colors pointer-events-auto"
            title="Hide AXE sphere"
            aria-label="Hide AXE sphere"
          >
            <ChevronDown className="w-4 h-4 drop-shadow-[0_2px_8px_rgba(0,0,0,.9)]" />
          </button>
        </div>

        {/* De tekst hoort ONDER de bol, dus staat hij hier -- als tweede kind
            van dezelfde kolom. Geen `fixed` en geen uitgerekende hoogte meer;
            de stapel doet de plaatsing. */}
        {showChat && (
        <div className="w-full max-h-[180px] overflow-y-auto scrollbar-thin flex flex-col gap-2 pointer-events-auto">
          {messages.slice(-6).map((msg, idx) => (
            <div key={msg.id + idx} className="text-center">
              {msg.role === 'user' ? (
                <p className="text-surface-body text-axe-text-primary/90 drop-shadow-[0_2px_12px_rgba(0,0,0,.95)] whitespace-pre-wrap">
                  {msg.content}
                </p>
              ) : (
                <div>
                  <span className="text-axe-label text-axe-accent-cyan drop-shadow-[0_2px_8px_rgba(0,0,0,.9)]">AXE</span>
                  <p className="text-surface-body text-axe-text-secondary/95 whitespace-pre-wrap mt-0.5 drop-shadow-[0_2px_12px_rgba(0,0,0,.95)]">
                    {msg.content}
                  </p>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-1 justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:300ms]" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        )}
      </div>

      {/* Even breed als de AXE-chatplaat eronder. Die is w-full met een
          kleine marge; dit veld stond op 720px en werd daardoor een smal
          blokje boven een balk die het hele scherm beslaat. */}
      <div className="absolute bottom-6 left-0 right-0 mx-3 md:mx-4 z-50 pointer-events-auto">
        <Panel focus className="px-3 py-2.5">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <IconButton type="button" accent aria-label="Photo search" title="Photo search">
              <Camera className="w-4 h-4" />
            </IconButton>
            <IconButton
              type="button"
              aria-label="Upload image"
              title="Upload image"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="w-4 h-4" />
            </IconButton>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" />
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask AXE anything about the web…"
              disabled={isLoading}
              className="axe-field flex-1 min-w-0 text-surface-input py-2"
            />
            <IconButton type="button" aria-label="Voice" title="Voice">
              <Mic className="w-4 h-4" />
            </IconButton>
            <IconButton type="button" onClick={onOpenSettings} aria-label="AI settings" title="Settings">
              <Settings className="w-4 h-4" />
            </IconButton>
            <IconButton
              type="submit"
              accent
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </IconButton>
          </form>
        </Panel>
      </div>
    </>
  );
}
