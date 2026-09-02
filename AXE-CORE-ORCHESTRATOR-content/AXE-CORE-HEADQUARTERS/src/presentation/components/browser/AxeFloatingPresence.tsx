import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, ImagePlus, Mic, Send, Settings } from 'lucide-react';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { Panel, IconButton } from '@/presentation/components/surface/Surface';
import type { AIMessage } from '@/domain/types/browser';
import type { AIConfig } from '@/presentation/hooks/useAIConfig';
import { PROVIDER_PRESETS } from '@/application/agents/aiAgent';

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
 * - Composer fixed bottom-center (command bar)
 * - Sphere + chat float in from bottom-right when you talk — no boxes
 * - Dismiss sends sphere back down; page stays visually free
 */
export function AxeFloatingPresence({
  visible,
  messages,
  onSendMessage,
  aiConfig,
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

  const providerName = aiConfig.isConfigured
    ? PROVIDER_PRESETS.find(p => p.endpoint === aiConfig.apiEndpoint)?.name ?? 'Custom'
    : 'Personal assistant';

  const showSphereCluster = sphereOpen && messages.length > 0;

  return (
    <>
      {/* Bottom-right: floating sphere + chat — slides up from below */}
      <div
        className={`absolute bottom-6 right-6 z-40 flex flex-col items-end gap-3 max-w-[min(360px,calc(100%-1.5rem))] transition-all duration-700 ease-[cubic-bezier(.2,.9,.3,1)] pointer-events-none ${
          showSphereCluster
            ? 'translate-y-0 opacity-100'
            : 'translate-y-[120%] opacity-0'
        }`}
        aria-hidden={!showSphereCluster}
      >
        {/* Floating chat — no panel chrome */}
        <div className="w-full max-h-[220px] overflow-y-auto scrollbar-thin flex flex-col gap-2.5 pointer-events-auto">
          {messages.slice(-5).map((msg, idx) => (
            <div key={msg.id + idx} className={msg.role === 'user' ? 'flex justify-end' : ''}>
              {msg.role === 'user' ? (
                <div className="max-w-[90%] px-3 py-2 rounded-card bg-axe-line-fill/90 backdrop-blur-sm text-surface-body text-axe-text-primary shadow-[0_8px_32px_rgba(0,0,0,.45)]">
                  {msg.content}
                </div>
              ) : (
                <div className="text-right">
                  <span className="text-axe-label text-axe-accent-cyan">AXE</span>
                  <p className="text-surface-body text-axe-text-secondary whitespace-pre-wrap mt-1 drop-shadow-[0_2px_8px_rgba(0,0,0,.8)]">
                    {msg.content}
                  </p>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-1 justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/60 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/60 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/60 animate-bounce [animation-delay:300ms]" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Sphere — transparent container, no box */}
        <div className="relative w-[min(200px,28vw)] h-[min(200px,28vw)] pointer-events-auto">
          <button
            type="button"
            onClick={() => setSphereOpen(false)}
            className="absolute -top-2 -left-2 z-10 w-7 h-7 rounded-full bg-black/60 border border-axe-line backdrop-blur-sm flex items-center justify-center text-axe-text-muted hover:text-axe-text-primary hover:border-axe-tint-line transition-colors"
            title="Hide AXE sphere"
            aria-label="Hide AXE sphere"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <div className="w-full h-full">
            <HolographicSphere status={sphereStatus} />
          </div>
          <p className="absolute -bottom-4 left-0 right-0 text-center text-axe-meta text-axe-text-secondary pointer-events-none">
            {isLoading ? 'Thinking…' : providerName}
          </p>
        </div>
      </div>

      {/* Bottom-center: command composer — always visible when panel is on */}
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
