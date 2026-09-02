import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, ImagePlus, Mic, Send, Settings } from 'lucide-react';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { Panel, IconButton } from '@/presentation/components/surface/Surface';
import type { AIMessage } from '@/domain/types/browser';
import type { AIConfig } from '@/presentation/hooks/useAIConfig';

interface AxeFloatingPresenceProps {
  visible: boolean;
  messages: AIMessage[];
  onSendMessage: (content: string) => void;
  aiConfig: AIConfig;
  onOpenSettings: () => void;
  isLoading?: boolean;
}

/**
 * AXE spatial presence:
 * - Composer fixed bottom-center
 * - Particle sphere floats bottom-right (no box, transparent canvas)
 * - Chat transparently under the sphere — conversation between you and AXE
 */
export function AxeFloatingPresence({
  visible,
  messages,
  onSendMessage,
  aiConfig: _aiConfig,
  onOpenSettings,
  isLoading = false,
}: AxeFloatingPresenceProps) {
  const [inputValue, setInputValue] = useState('');
  const [sphereOpen, setSphereOpen] = useState(false);
  const [sphereStatus, setSphereStatus] = useState<CoreStatus>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSphereStatus(isLoading ? 'thinking' : 'idle');
  }, [isLoading]);

  useEffect(() => {
    if (messages.length > 0) setSphereOpen(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!visible) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
    setSphereOpen(true);
  };

  const showSphereCluster = sphereOpen && messages.length > 0;

  return (
    <>
      {/* Bottom-right cluster: sphere on top, transparent chat underneath */}
      <div
        className={`fixed bottom-[5.5rem] right-5 z-40 flex flex-col items-end gap-1 max-w-[min(320px,calc(100%-1.5rem))] transition-all duration-700 ease-[cubic-bezier(.2,.9,.3,1)] pointer-events-none ${
          showSphereCluster ? 'translate-y-0 opacity-100' : 'translate-y-[140%] opacity-0'
        }`}
        aria-hidden={!showSphereCluster}
      >
        {/* Particle sphere — no background, no box */}
        <div className="relative w-[min(168px,22vw)] h-[min(168px,22vw)] pointer-events-auto">
          <button
            type="button"
            onClick={() => setSphereOpen(false)}
            className="absolute -top-1 -left-1 z-10 w-6 h-6 rounded-full flex items-center justify-center text-axe-text-muted/80 hover:text-axe-accent-cyan transition-colors pointer-events-auto"
            title="Hide AXE sphere"
            aria-label="Hide AXE sphere"
          >
            <ChevronDown className="w-4 h-4 drop-shadow-[0_2px_6px_rgba(0,0,0,.9)]" />
          </button>
          <HolographicSphere status={sphereStatus} variant="floating" />
        </div>

        {/* Transparent chat — floats under the sphere */}
        <div className="w-full max-h-[200px] overflow-y-auto scrollbar-thin flex flex-col gap-2 pointer-events-auto pr-1">
          {messages.slice(-6).map((msg, idx) => (
            <div key={msg.id + idx} className={`${msg.role === 'user' ? 'text-right' : 'text-right'}`}>
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
            <div className="flex gap-1 justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce drop-shadow-[0_0_6px_rgba(34,211,238,.8)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:300ms]" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom-center composer */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[min(720px,calc(100%-2rem))] z-50 pointer-events-auto">
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
