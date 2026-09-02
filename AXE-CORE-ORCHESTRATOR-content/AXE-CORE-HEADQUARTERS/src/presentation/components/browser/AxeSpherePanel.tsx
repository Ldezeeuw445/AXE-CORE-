import { useState, useRef, useEffect } from 'react';
import { Send, Settings, Mic } from 'lucide-react';
import { HolographicSphere, type CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import type { AIMessage, AIMode } from '@/domain/types/browser';
import type { AIConfig } from '@/presentation/hooks/useAIConfig';
import { PROVIDER_PRESETS } from '@/application/agents/aiAgent';

interface AxeSpherePanelProps {
  messages: AIMessage[];
  mode: AIMode;
  onModeChange: (mode: AIMode) => void;
  onSendMessage: (content: string) => void;
  currentUrl: string;
  aiConfig: AIConfig;
  onOpenSettings: () => void;
  isLoading?: boolean;
}

export function AxeSpherePanel({
  messages,
  onSendMessage,
  aiConfig,
  onOpenSettings,
  isLoading = false,
}: AxeSpherePanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [sphereStatus, setSphereStatus] = useState<CoreStatus>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    setSphereStatus(isLoading ? 'thinking' : 'idle');
  }, [isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  return (
    <div className="w-[380px] flex-shrink-0 h-full border-l border-white/[0.06] bg-[#060608] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div>
          <h3 className="text-sm font-semibold text-white">AXE</h3>
          <p className="text-[10px] text-white/40">
            {aiConfig.isConfigured
              ? `${PROVIDER_PRESETS.find(p => p.endpoint === aiConfig.apiEndpoint)?.name ?? 'Custom'}`
              : 'Personal assistant'}
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          title="AI Settings"
        >
          <Settings className="w-4 h-4 text-white/40" />
        </button>
      </div>

      <div className="relative h-[220px] flex-shrink-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 60%, rgba(251,191,36,0.12) 0%, rgba(6,6,8,0) 70%)',
          }}
        />
        <HolographicSphere status={sphereStatus} />
        <div className="absolute bottom-3 left-0 right-0 text-center">
          <p className="text-[11px] text-white/50">
            {isLoading ? 'Thinking…' : 'Ask anything about the web'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-thin">
        {messages.map((msg, idx) => (
          <div key={msg.id + idx}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="max-w-[90%] px-3 py-2 rounded-2xl rounded-br-md bg-white/[0.08] text-[12px] text-white/90 leading-relaxed">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-cyan-400/80">AXE</span>
                <p className="text-[12px] text-white/75 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-white/[0.06]">
        <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Say something…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
          />
          <button type="button" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer" title="Voice">
            <Mic className="w-4 h-4 text-white/30" />
          </button>
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="p-1.5 rounded-lg bg-cyan-400/20 hover:bg-cyan-400/30 transition-colors cursor-pointer disabled:opacity-30"
          >
            <Send className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </form>
    </div>
  );
}
