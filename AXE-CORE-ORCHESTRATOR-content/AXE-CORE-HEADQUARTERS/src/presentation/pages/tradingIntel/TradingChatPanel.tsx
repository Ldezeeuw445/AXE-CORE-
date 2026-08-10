/**
 * TradingChatPanel — talk to the trading agent directly. Bottom-right of
 * the Brain tab, persistent across visits (history saved via settings).
 */
import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Trash2 } from 'lucide-react';
import {
  loadTradingChatHistory,
  saveTradingChatHistory,
  clearTradingChatHistory,
  sendTradingChatMessage,
  type TradingChatMessage,
} from '@/application/tradingIntel/tradingAgentChat';
import type { TradingDeskState } from './useTradingDeskState';

export function TradingChatPanel({ desk }: { desk: TradingDeskState }) {
  const [messages, setMessages] = useState<TradingChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadTradingChatHistory().then(setMessages);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const userMsg: TradingChatMessage = { role: 'user', text, timestamp: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    await saveTradingChatHistory(next);
    setSending(true);
    try {
      const reply = await sendTradingChatMessage({
        text,
        history: messages,
        symbol: desk.chartSymbol,
        lastTrace: desk.lastTrace,
        learning: desk.learning,
        memory: desk.memory,
      });
      const agentMsg: TradingChatMessage = { role: 'agent', text: reply, timestamp: Date.now() };
      const withReply = [...next, agentMsg];
      setMessages(withReply);
      await saveTradingChatHistory(withReply);
    } catch (e) {
      const errMsg: TradingChatMessage = {
        role: 'agent',
        text: `Couldn't reach a provider: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: Date.now(),
      };
      setMessages([...next, errMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl overflow-hidden" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className="text-[12px] font-semibold" style={{ color: '#F5F0E6' }}>Talk to the agent</span>
        <button
          type="button"
          title="Clear chat"
          onClick={async () => { await clearTradingChatHistory(); setMessages([]); }}
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {!messages.length && (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Ask him why he took a trade, what he's watching, or what he'd do differently next time.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{
                background: m.role === 'user' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
                color: m.role === 'user' ? '#e9d5ff' : 'rgba(255,255,255,0.75)',
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Loader2 size={12} className="animate-spin" /> thinking…
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-2 border-t shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send(); }}
          placeholder="Message the agent…"
          className="flex-1 rounded px-2 py-1.5 text-[12px]"
          style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
        />
        <button
          type="button"
          disabled={sending || !input.trim()}
          onClick={() => void send()}
          className="p-1.5 rounded disabled:opacity-40"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd' }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
