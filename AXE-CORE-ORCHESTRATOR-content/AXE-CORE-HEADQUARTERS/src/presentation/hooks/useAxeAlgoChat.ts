/**
 * useAxeAlgoChat — one chat hook, shared by every AXE ALGO chat surface
 * (Brain tab's TradingChatPanel, the RightPanel widget, the floating
 * window). Same persisted history everywhere (loadTradingChatHistory),
 * so it's genuinely one conversation with one agent, not three separate
 * ones that happen to look alike.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadTradingChatHistory,
  saveTradingChatHistory,
  clearTradingChatHistory,
  sendTradingChatMessage,
  loadDefaultChatContext,
  type TradingChatMessage,
  type TradingChatAttachment,
} from '@/application/tradingIntel/tradingAgentChat';
import type { TradingDeskState } from '@/presentation/pages/tradingIntel/useTradingDeskState';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB — data-URL images live in settings JSON, keep it bounded

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** `desk` is optional — pass it from the Brain tab for full desk context
 *  (current chart symbol, live trace/learning/memory already in state);
 *  omit it from surfaces outside the Trading tab and this hook fetches the
 *  same grounding data standalone (loadDefaultChatContext). */
export function useAxeAlgoChat(desk?: TradingDeskState) {
  const [messages, setMessages] = useState<TradingChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<TradingChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadTradingChatHistory().then(setMessages);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const addAttachment = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    if (isImage && file.size <= MAX_IMAGE_BYTES) {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingAttachments(prev => [...prev, { name: file.name, kind: 'image', dataUrl }]);
    } else {
      setPendingAttachments(prev => [...prev, { name: file.name, kind: isImage ? 'image' : 'file' }]);
    }
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    const attachments = pendingAttachments;
    if ((!text && !attachments.length) || sending) return;
    setInput('');
    setPendingAttachments([]);

    // Attachments aren't analyzed by the model (callProvider is text-only) —
    // be honest about that instead of silently pretending it saw the image.
    const attachmentNote = attachments.length
      ? `\n[Attached: ${attachments.map(a => a.name).join(', ')}]`
      : '';
    const userMsg: TradingChatMessage = {
      role: 'user',
      text: text + attachmentNote,
      timestamp: Date.now(),
      attachments: attachments.length ? attachments : undefined,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    await saveTradingChatHistory(next);
    setSending(true);
    try {
      const ctx = desk
        ? { symbol: desk.chartSymbol, lastTrace: desk.lastTrace, learning: desk.learning, memory: desk.memory }
        : await loadDefaultChatContext();
      const reply = await sendTradingChatMessage({ text: userMsg.text, history: messages, ...ctx });
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
  }, [input, pendingAttachments, sending, messages, desk]);

  const clear = useCallback(async () => {
    await clearTradingChatHistory();
    setMessages([]);
  }, []);

  return {
    messages, listRef,
    input, setInput,
    pendingAttachments, addAttachment, removeAttachment,
    sending, send, clear,
  };
}
