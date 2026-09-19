import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Mic, Send, Settings } from 'lucide-react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';
import { IconButton } from '@/presentation/components/surface/Surface';
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
 * AXE's browser presence.
 *
 * This deliberately uses the SAME 64px status particle used by the rest of
 * AXE. The old browser-only sphere was large, visually unrelated to AXE's
 * state language and lived in a fixed overlay that could cover the page.
 *
 * The browser now reserves a real right-hand rail for AXE. Nothing here is
 * fixed over the web page: conversation, particle and composer all occupy
 * layout space. The status orb still reads the global voice state and gets a
 * browser-work signal while a provider request is active.
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
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!visible) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  return (
    <aside
      className="w-[300px] xl:w-[330px] min-w-[260px] h-full shrink-0 border-l border-axe-line bg-black/20 backdrop-blur-sm flex flex-col pointer-events-auto"
      aria-label="AXE browser assistant"
    >
      <div className="shrink-0 flex items-center gap-3 px-3 py-3 border-b border-axe-line">
        <div className="w-16 h-16 shrink-0 flex items-center justify-center">
          <AxeStatusOrb size={64} werk={{ zoekt: isLoading }} toonLabel />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-axe-label text-axe-text-primary">AXE</div>
          <div className="mt-1 text-axe-meta text-axe-text-muted leading-relaxed">
            Browser companion · same live state as AXE Core
          </div>
        </div>
        <IconButton type="button" onClick={onOpenSettings} aria-label="AI settings" title="Settings">
          <Settings className="w-4 h-4" />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-axe-meta text-axe-text-muted leading-relaxed">
            Ask AXE about the page, research something, or hand work to the browser agent.
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={msg.id + idx} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {msg.role === 'user' ? (
              <div className="max-w-[92%] rounded-2xl rounded-br-md border border-white/[0.07] bg-white/[0.06] px-3 py-2 text-axe-meta text-axe-text-primary/90 whitespace-pre-wrap">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[96%]">
                <span className="text-axe-label text-axe-accent-cyan">AXE</span>
                <p className="mt-1 text-axe-meta text-axe-text-secondary/95 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-1.5" aria-label="AXE is working">
            <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-axe-accent-cyan/70 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-axe-line p-3">
        <div className="rounded-2xl border border-axe-line bg-white/[0.035] p-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask AXE about this page…"
            disabled={isLoading}
            rows={3}
            className="w-full resize-none bg-transparent px-1 py-1 text-surface-input text-axe-text-primary placeholder:text-axe-text-muted outline-none"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <IconButton type="button" accent aria-label="Photo search" title="Photo search">
              <Camera className="w-4 h-4" />
            </IconButton>
            <IconButton type="button" aria-label="Upload image" title="Upload image" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="w-4 h-4" />
            </IconButton>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" />
            <IconButton type="button" aria-label="Voice" title="Voice">
              <Mic className="w-4 h-4" />
            </IconButton>
            <div className="flex-1" />
            <IconButton type="submit" accent disabled={!inputValue.trim() || isLoading} aria-label="Send">
              <Send className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </form>
    </aside>
  );
}
