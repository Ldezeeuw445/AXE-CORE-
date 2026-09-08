import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Mic, Send, Settings } from 'lucide-react';
import { IconButton } from '@/presentation/components/surface/Surface';
import type { AIMessage } from '@/domain/types/browser';
import type { AIConfig } from '@/presentation/hooks/useAIConfig';
import { PlaatPanel } from '@/presentation/components/layout/PlaatSlots';

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
  // sphereVisible is weg: de bol zat in een zwevend blok dat je kon
  // wegklikken. In de onderband heeft hij een vaste plek, dus verbergen
  // hoort daar niet meer bij -- dat is wat het paneel zelf doet.
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
      return;
    }
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
    setSphereReady(true);
  };


  return (
    <>
      {/* ── AXE hangt in de onderband, naast de chat ──────────────────────
       *
       * Bol en tekst stonden `fixed` rechtsonder en zweefden daardoor over de
       * pagina: ze liepen door de inhoud heen en hadden geen eigen plek. In de
       * code-editor staan terminal, chat en code-agent naast elkaar in die
       * band, en dat is precies wat hier hoort -- de chat met AXE naast de
       * chat van de app, met dezelfde plaat en dezelfde dichtheid.
       *
       * PlaatPanel doet de plaatsing; deze component levert alleen de inhoud
       * en de composer. Daardoor kan er niets meer ergens doorheen lopen. */}
      <PlaatPanel
        side="right"
        title="AXE"
        accent="cyaan"
        fill
        composer={
          <form onSubmit={handleSubmit} className="flex items-end gap-2 w-full">
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
            <IconButton type="submit" accent disabled={!inputValue.trim() || isLoading} aria-label="Send">
              <Send className="w-4 h-4" />
            </IconButton>
          </form>
        }
      >
        <div className="h-full flex items-center gap-3 min-h-0">
          {/* De bol van Home, zonder vak. Alleen een maat, want een canvas
              zonder maat is nul groot. */}
          <div className="relative w-[132px] h-[132px] shrink-0">
            {sphereReady && (
              <Suspense fallback={null}>
                <AxeCoreSphere />
              </Suspense>
            )}
          </div>

          <div className="flex-1 min-w-0 max-h-full overflow-y-auto scrollbar-thin flex flex-col gap-2">
            {messages.slice(-6).map((msg, idx) => (
              <div key={msg.id + idx}>
                {msg.role === 'user' ? (
                  <p className="text-surface-body text-axe-text-primary/90 whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div>
                    <span className="text-axe-label text-axe-accent-cyan">AXE</span>
                    <p className="text-surface-body text-axe-text-secondary/95 whitespace-pre-wrap mt-0.5">{msg.content}</p>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:300ms]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </PlaatPanel>
    </>
  );
}
