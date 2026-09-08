import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Mic, Send, Settings } from 'lucide-react';
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
  // WebGL pas na 400ms starten, zodat het openen van de tab niet stokt.
  //
  // Dit hing eerder aan `visible` en zette de bol weer op false zodra dat
  // wegviel -- dan verdween hij. Op Home staat hij er altijd, dus hier ook:
  // de vertraging spreidt alleen het laden, ze verbergt niets.
  useEffect(() => {
    const id = window.setTimeout(() => setSphereReady(true), 400);
    return () => window.clearTimeout(id);
  }, []);

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
      {/* ── AXE staat naast de band, niet erboven ──────────────────────────
       *
       * Eerst zweefde dit `fixed` over de pagina en liep het overal doorheen.
       * Daarna probeerde ik het in een PlaatPanel te hangen, maar dat paneel
       * hoort bij de onderband van de schil en rendert hier niet -- de bol
       * verdween daardoor helemaal.
       *
       * De indeling houdt de plek al vrij: de chatplaat, de composer en de
       * nav zijn gecentreerd met een uitgerekende breedte, dus links en
       * rechts blijft (100% - band)/2 over. De css noemt die ruimte zelf
       * "niet leegte: daar kan iets naast". Daar staat AXE nu: de bol naast
       * de composer, en zijn chat daarnaast. */}
      {/* Onder elkaar in plaats van naast elkaar.
       *
       * De ruimte naast de band is smal. Zette ik de bol en de tekst daar op
       * een rij, dan hield de bol nog geen zestig pixels over -- een propje
       * waarvan de deeltjes tot een waas versmelten. Boven elkaar krijgt hij
       * de volle breedte van die kolom, en dan is hij weer scherp. */}
      <div className="axe-naast-band fixed bottom-0 right-0 z-40 h-[clamp(150px,20vh,240px)] flex flex-col items-center justify-end gap-1.5 pb-3 pr-3 pointer-events-none">
        {/* De bol van Home, zonder vak eromheen. Alleen een maat, want een
            canvas zonder maat is nul groot.

            items-start hierboven: de tekst hoort RECHTSBOVEN te beginnen en
            naar beneden te groeien als er een antwoord komt. Met items-center
            zweefde alles halverwege en sprong het bij elk bericht omhoog. */}
        <div className="relative w-full max-w-[190px] aspect-square shrink-0">
          {/* Geen `visible`-poort meer om de bol heen: hij hoort er altijd te
              staan, zoals op Home. De vertraging blijft alleen om het WebGL-
              laden na het openen van de tab te spreiden -- niet om hem te
              verbergen. */}
          {sphereReady && (
            <Suspense fallback={null}>
              <AxeCoreSphere />
            </Suspense>
          )}
        </div>

        <div className="w-full min-w-0 max-h-[38%] overflow-y-auto scrollbar-thin flex flex-col gap-1.5 pointer-events-auto text-center">
          {messages.slice(-6).map((msg, idx) => (
            <div key={msg.id + idx}>
              {msg.role === 'user' ? (
                <p className="text-axe-meta text-axe-text-primary/90 whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div>
                  <span className="text-axe-label text-axe-accent-cyan">AXE</span>
                  <p className="text-axe-meta text-axe-text-secondary/95 whitespace-pre-wrap mt-0.5">{msg.content}</p>
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

      {/* Het vraagveld hoort bij de pagina, dus staat het op dezelfde breedte
          als de band -- niet 720px in het midden en niet volle breedte. */}
      <div className="axe-bandbreed absolute bottom-6 left-0 right-0 z-50 pointer-events-auto">
        <Panel focus className="px-3 py-2.5">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <IconButton type="button" accent aria-label="Photo search" title="Photo search">
              <Camera className="w-4 h-4" />
            </IconButton>
            <IconButton type="button" aria-label="Upload image" title="Upload image" onClick={() => fileRef.current?.click()}>
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
        </Panel>
      </div>
    </>
  );
}
