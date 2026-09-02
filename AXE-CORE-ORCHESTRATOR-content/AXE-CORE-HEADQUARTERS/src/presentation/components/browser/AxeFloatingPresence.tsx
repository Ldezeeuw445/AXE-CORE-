import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Mic, Send, Settings, Sparkles, X } from 'lucide-react';
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
 * Spatial AXE presence — sphere floats over the whole browser tab;
 * composer is a single floating pill (no fixed right panel).
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
  const [expanded, setExpanded] = useState(false);
  const [sphereStatus, setSphereStatus] = useState<CoreStatus>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSphereStatus(isLoading ? 'thinking' : 'idle');
  }, [isLoading]);

  useEffect(() => {
    if (messages.length > 0) setExpanded(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!visible) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
    setExpanded(true);
  };

  const providerName = aiConfig.isConfigured
    ? PROVIDER_PRESETS.find(p => p.endpoint === aiConfig.apiEndpoint)?.name ?? 'Custom'
    : 'Personal assistant';

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {/* Sphere — alive, no panel chrome, overlays content */}
      <div
        className="absolute right-[8%] top-[6%] w-[min(340px,38vw)] h-[min(340px,38vh)] pointer-events-none animate-float"
        aria-hidden
      >
        <div className="relative w-full h-full opacity-95">
          <HolographicSphere status={sphereStatus} />
        </div>
        <p className="absolute -bottom-1 left-0 right-0 text-center text-axe-meta text-axe-text-secondary pointer-events-none">
          {isLoading ? 'Thinking…' : 'AXE is here'}
        </p>
      </div>

      {/* Floating stack: optional transcript + composer */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[min(720px,calc(100%-2rem))] flex flex-col gap-3 pointer-events-none">
        {expanded && messages.length > 0 && (
          <Panel focus className="max-h-[220px] overflow-y-auto p-3 pointer-events-auto scrollbar-thin">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-surface-title font-semibold text-axe-text-primary">AXE</p>
                <p className="text-axe-meta text-axe-text-muted">{providerName}</p>
              </div>
              <IconButton onClick={() => setExpanded(false)} aria-label="Collapse chat">
                <X className="w-4 h-4" />
              </IconButton>
            </div>
            <div className="space-y-3">
              {messages.slice(-6).map((msg, idx) => (
                <div key={msg.id + idx}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] px-3 py-2 rounded-card bg-axe-line-fill text-surface-body text-axe-text-primary">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-axe-label text-axe-accent-cyan">AXE</span>
                      <p className="text-surface-body text-axe-text-secondary whitespace-pre-wrap mt-1">{msg.content}</p>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/60 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/60 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/60 animate-bounce [animation-delay:300ms]" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </Panel>
        )}

        <Panel focus className="pointer-events-auto px-3 py-2.5">
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
          <div className="flex items-center gap-2 mt-2 px-0.5">
            <Sparkles className="w-3 h-3 text-axe-accent-cyan shrink-0" />
            <span className="text-axe-meta text-axe-text-muted truncate">
              Floating composer — sphere overlays the whole tab
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
