/**
 * AgentChatHub.tsx
 * ------------------------------------------------------------------
 * Individual chat panels for each agent (KimiClaw, KimiCode, KimiWork)
 * positioned in the right sidebar. Each agent has its own conversation,
 * can see shared memory, and can collaborate with other agents.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Code2, BarChart3, Bot, User, Send, Mic,
  Plus, X, FileText, Trash2, Upload, Brain,
  ChevronRight, Sparkles, GripVertical, Zap, Share2,
} from 'lucide-react';
import { callProvider, PROVIDERS, useVoiceStore } from '@/presentation/store/voiceStore';
import type { KeySlot } from '@/presentation/store/voiceStore';
import { saveGlobalMemory, buildGlobalMemoryContext } from '@/infrastructure/persistence/globalMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { getEveSystemPromptSupplement } from '@/domain/catalogs/eveSkills';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface AgentChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
  agentName: string;
  provider?: string;
  model?: string;
}

interface AgentDef {
  id: string;
  name: string;
  role: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  systemPrompt: string;
}

interface RagFile {
  id: string;
  name: string;
  content: string;
  agentId: string;
  uploadedAt: number;
}

/* ─── Agent Definitions ────────────────────────────────────────────────── */
const AGENTS: AgentDef[] = [
  {
    id: 'kimiclaw', name: 'KimiClaw', role: 'Search & Browse',
    icon: Search, color: '#F59E0B',
    systemPrompt: 'You are KimiClaw, a web search and browsing specialist. You search the web, fetch pages, and extract key information. Be concise and factual.',
  },
  {
    id: 'kimicode', name: 'KimiCode', role: 'Code Agent',
    icon: Code2, color: '#10B981',
    systemPrompt: 'You are KimiCode, a code specialist. You write, review, debug, and optimize code. Always provide complete, runnable code.',
  },
  {
    id: 'kimiwork', name: 'KimiWork', role: 'Analysis Engine',
    icon: BarChart3, color: '#8B5CF6',
    systemPrompt: 'You are KimiWork, a data analysis and research specialist. You analyze data, create insights, and synthesize research.',
  },
];

/* ─── Shared Memory ────────────────────────────────────────────────────── */
const MEMORY_KEY = 'axe_shared_memory';
const RAG_KEY = 'axe_rag_files';
const CHATS_KEY = 'axe_agent_chats';
const MAX_AGENT_MSGS = 200; // oldest messages dropped beyond this limit

interface SharedMemoryEntry {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: number;
  type: 'insight' | 'task' | 'file' | 'message';
}

function loadSharedMemory(): SharedMemoryEntry[] {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]'); } catch { return []; }
}
function saveSharedMemory(m: SharedMemoryEntry[]) { localStorage.setItem(MEMORY_KEY, JSON.stringify(m)); }
function addMemory(entry: Omit<SharedMemoryEntry, 'id' | 'timestamp'>) {
  const all = loadSharedMemory();
  all.unshift({ ...entry, id: `mem_${Date.now()}`, timestamp: Date.now() });
  saveSharedMemory(all.slice(0, 100)); // keep last 100
}

function loadRagFiles(): RagFile[] {
  try { return JSON.parse(localStorage.getItem(RAG_KEY) || '[]'); } catch { return []; }
}
function saveRagFiles(files: RagFile[]) { localStorage.setItem(RAG_KEY, JSON.stringify(files)); }

function loadAgentChats(): Record<string, AgentChatMessage[]> {
  try { return JSON.parse(localStorage.getItem(CHATS_KEY) || '{}'); } catch { return {}; }
}
function saveAgentChats(chats: Record<string, AgentChatMessage[]>) {
  // Safety net: enforce per-agent cap on every save path
  const capped: Record<string, AgentChatMessage[]> = {};
  for (const [id, msgs] of Object.entries(chats)) {
    capped[id] = msgs.length > MAX_AGENT_MSGS ? msgs.slice(-MAX_AGENT_MSGS) : msgs;
  }
  localStorage.setItem(CHATS_KEY, JSON.stringify(capped));
}

/* ─── Real LLM Agent Response ───────────────────────────────────────────── */
async function getRealAgentResponse(
  agent: AgentDef,
  userText: string,
  sharedContext: string,
  history: AgentChatMessage[],
  globalMemoryContext?: string,
): Promise<{ text: string; provider: string; model: string }> {
  // Gather all configured slots from voiceStore
  const state = useVoiceStore.getState();
  const slots: KeySlot[] = [
    state.primarySlot,
    state.fallback1Slot,
    state.fallback2Slot,
    state.fallback3Slot,
  ].filter((s): s is KeySlot => !!s);

  if (slots.length === 0) {
    return {
      text: `No LLM provider configured. Go to Settings → AI Keys to add a provider (Anthropic, OpenAI, Google, Groq, etc.).`,
      provider: 'none',
      model: '',
    };
  }

  // Build messages: system + recent history (last 10) + user
  const memCtx = globalMemoryContext ? `\n\n## Long-Term Memory\n${globalMemoryContext}` : '';
  const baseContent = sharedContext
    ? `${agent.systemPrompt}\n\n## Shared Context\n${sharedContext}`
    : agent.systemPrompt;
  const systemContent = baseContent + memCtx;

  const historyMessages = history.slice(-10).map(m => ({
    role: m.role === 'user' ? 'user' as const : 'assistant' as const,
    content: m.text,
  }));

  const messages = [
    { role: 'system' as const, content: systemContent },
    ...historyMessages.slice(0, -1),
    { role: 'user' as const, content: userText },
  ];

  // Try each slot in order (inject EVE skills per provider)
  for (const slot of slots) {
    try {
      const eveSupp = getEveSystemPromptSupplement(slot.provider);
      const slotMessages = eveSupp
        ? [{ ...messages[0], content: messages[0].content + eveSupp }, ...messages.slice(1)]
        : messages;
      const reply = await callProvider(slot, slotMessages);
      const cfg = PROVIDERS.find(p => p.id === slot.provider);
      return {
        text: reply.trim() || '(empty response)',
        provider: cfg?.name ?? slot.provider,
        model: slot.model ?? cfg?.defaultModel ?? '',
      };
    } catch (err) {
      console.warn(`[AgentChatHub] ${slot.provider} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return {
    text: 'All providers failed. Check your API keys in Settings.',
    provider: 'error',
    model: '',
  };
}

/* ─── Single Agent Chat Panel ──────────────────────────────────────────── */
function AgentChatPanel({
  agent, onClose, onForwardTo,
}: {
  agent: AgentDef;
  onClose: () => void;
  onForwardTo: (targetAgentId: string, text: string, sourceAgentName: string) => void;
}) {
  const [messages, setMessages] = useState<AgentChatMessage[]>(() => {
    const all = loadAgentChats();
    return all[agent.id] || [];
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ragFiles, setRagFiles] = useState<RagFile[]>(() => loadRagFiles().filter(f => f.agentId === agent.id));
  const [showRag, setShowRag] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [sharingMsgId, setSharingMsgId] = useState<string | null>(null);
  const [trimmed, setTrimmed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close share popover on outside click
  useEffect(() => {
    if (!sharingMsgId) return;
    const close = () => setSharingMsgId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [sharingMsgId]);

  useEffect(() => {
    const all = loadAgentChats();
    if (messages.length > MAX_AGENT_MSGS) {
      // Trim in-state too so the component stays consistent
      setMessages(prev => prev.slice(-MAX_AGENT_MSGS));
      setTrimmed(true);
    }
    all[agent.id] = messages.length > MAX_AGENT_MSGS ? messages.slice(-MAX_AGENT_MSGS) : messages;
    saveAgentChats(all);
  }, [messages, agent.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: AgentChatMessage = {
      id: `msg_${Date.now()}`, role: 'user', text, timestamp: Date.now(), agentName: 'Luka',
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    // Add to shared memory
    addMemory({ agentId: agent.id, agentName: agent.name, content: `Q: ${text}`, type: 'message' });

    // Build context from RAG files + shared memory
    const ragContext = ragFiles.map(f => `[FILE: ${f.name}]\n${f.content.slice(0, 500)}`).join('\n\n');
    const sharedMem = loadSharedMemory().slice(0, 5).map(m => `[${m.agentName}] ${m.content}`).join('\n');
    const fullContext = `${sharedMem}\n\n${ragContext}`.trim();

    // Pull relevant long-term memories (non-blocking)
    const globalCtx = await buildGlobalMemoryContext(AXE_USER_ID, text, 800).catch(() => '');

    // Real LLM call
    const currentMessages = [...messages, userMsg];
    const result = await getRealAgentResponse(agent, text, fullContext, currentMessages, globalCtx);

    const agentMsg: AgentChatMessage = {
      id: `msg_${Date.now() + 1}`, role: 'agent', text: result.text,
      timestamp: Date.now(), agentName: agent.name,
      provider: result.provider, model: result.model,
    };
    setMessages(prev => [...prev, agentMsg]);
    setBusy(false);

    // Add response to shared memory
    addMemory({ agentId: agent.id, agentName: agent.name, content: result.text.slice(0, 200), type: 'insight' });

    // Persist to global memory (Supabase, falls back to localStorage cache)
    saveGlobalMemory({
      user_id: AXE_USER_ID,
      category: 'conversation_context',
      key: `${agent.id}:${Date.now()}`,
      value: JSON.stringify({ q: text.slice(0, 200), a: result.text.slice(0, 400), provider: result.provider }),
      confidence: 0.85,
    }).catch(() => {});
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const newFile: RagFile = { id: `rag_${Date.now()}`, name: file.name, content, agentId: agent.id, uploadedAt: Date.now() };
      const updated = [...ragFiles, newFile];
      setRagFiles(updated);
      const allRag = loadRagFiles();
      saveRagFiles([...allRag.filter(f => f.agentId !== agent.id), ...updated]);
      addMemory({ agentId: agent.id, agentName: agent.name, content: `Uploaded file: ${file.name} (${Math.round(content.length / 1024)}KB)`, type: 'file' });
    };
    reader.readAsText(file);
  };

  const clearChat = () => {
    setMessages([]);
    setTrimmed(false);
    const all = loadAgentChats();
    delete all[agent.id];
    saveAgentChats(all);
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden" style={{ background: '#0a0a0a', border: `1px solid ${agent.color}20` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${agent.color}15`, background: `${agent.color}08` }}>
        <div className="flex items-center gap-2">
          <div className="rounded-md flex items-center justify-center" style={{ width: 24, height: 24, background: `${agent.color}20` }}>
            <agent.icon size={12} style={{ color: agent.color }} />
          </div>
          <div>
            <span className="text-[10px] font-semibold" style={{ color: '#fff' }}>{agent.name}</span>
            <span className="text-[8px] ml-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{agent.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowRag(v => !v)} className="p-1 rounded" title="RAG Files" style={{ color: ragFiles.length > 0 ? agent.color : 'rgba(255,255,255,0.25)' }}>
            <FileText size={10} />
          </button>
          <button onClick={() => setShowMemory(v => !v)} className="p-1 rounded" title="Shared Memory" style={{ color: 'rgba(255,255,255,0.25)' }}>
            <Brain size={10} />
          </button>
          <button onClick={clearChat} className="p-1 rounded" title="Clear chat" style={{ color: 'rgba(255,255,255,0.15)' }}><Trash2 size={9} /></button>
          <button onClick={onClose} className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.25)' }}><X size={11} /></button>
        </div>
      </div>

      {/* RAG Files panel */}
      <AnimatePresence>
        {showRag && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="p-2 space-y-1">
              {ragFiles.map(f => (
                <div key={f.id} className="flex items-center justify-between text-[9px] px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="flex items-center gap-1"><FileText size={8} style={{ color: agent.color }} />{f.name}</span>
                  <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{Math.round(f.content.length / 1024)}KB</span>
                </div>
              ))}
              <label className="flex items-center justify-center gap-1 text-[9px] py-1.5 rounded cursor-pointer" style={{ border: `1px dashed ${agent.color}30`, color: agent.color }}>
                <Upload size={9} /> Upload file
                <input type="file" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared Memory panel */}
      <AnimatePresence>
        {showMemory && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="p-2 max-h-24 overflow-y-auto space-y-1">
              {loadSharedMemory().slice(0, 8).map(m => (
                <div key={m.id} className="text-[8px] px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)' }}>
                  <span style={{ color: AGENTS.find(a => a.id === m.agentId)?.color || '#fff' }}>[{m.agentName}]</span> {m.content.slice(0, 60)}
                </div>
              ))}
              {loadSharedMemory().length === 0 && <div className="text-[8px] text-center py-1" style={{ color: 'rgba(255,255,255,0.2)' }}>No shared memory yet</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-1 min-h-0">
        {/* Trimmed-history notice */}
        {trimmed && (
          <div className="flex items-center gap-1.5 rounded px-2 py-1 text-[8px] mb-1" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'rgba(245,158,11,0.7)' }}>
            <Sparkles size={7} />
            Older messages were pruned to stay within the {MAX_AGENT_MSGS}-message limit. Clear chat to start fresh.
          </div>
        )}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <agent.icon size={20} style={{ color: `${agent.color}30` }} />
            <div>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Ask {agent.name} anything</p>
              <p className="text-[8px] mt-0.5" style={{ color: 'rgba(255,255,255,0.15)' }}>Upload files for RAG context</p>
            </div>
          </div>
        )}
        {messages.map(m => {
          const isUser = m.role === 'user';
          const otherAgents = AGENTS.filter(a => a.id !== agent.id);
          const isSharing = sharingMsgId === m.id;
          return (
            <div key={m.id} className={`flex gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="mt-0.5 flex-shrink-0">{isUser ? <User size={9} style={{ color: 'rgba(255,255,255,0.3)' }} /> : <Bot size={9} style={{ color: agent.color }} />}</div>
              <div className="max-w-[85%] flex flex-col gap-0.5">
                <div className="rounded px-2 py-1 text-[9px] leading-snug whitespace-pre-wrap" style={{ background: isUser ? `${agent.color}15` : 'rgba(255,255,255,0.04)', color: isUser ? '#fff' : 'rgba(255,255,255,0.7)', borderLeft: isUser ? 'none' : `2px solid ${agent.color}40` }}>
                  {m.text}
                </div>
                {/* Provider badge + share button (agent replies only) */}
                {!isUser && (
                  <div className="flex items-center justify-between gap-1 px-1">
                    {m.provider && m.provider !== 'none' && m.provider !== 'error' ? (
                      <div className="flex items-center gap-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        <Zap size={7} />
                        <span className="text-[7px]">{m.provider}{m.model ? ` · ${m.model.split('/').pop()?.split(':')[0]}` : ''}</span>
                      </div>
                    ) : <span />}
                    {/* Share button */}
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setSharingMsgId(isSharing ? null : m.id); }}
                        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[7px] transition-opacity hover:opacity-100"
                        style={{ color: 'rgba(255,255,255,0.25)', opacity: isSharing ? 1 : undefined }}
                        title="Forward to another agent"
                      >
                        <Share2 size={7} /> Share
                      </button>
                      {/* Share popover */}
                      {isSharing && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="absolute bottom-full right-0 mb-1 rounded-lg py-1 z-30"
                          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.12)', minWidth: 110 }}
                        >
                          {otherAgents.map(target => (
                            <button
                              key={target.id}
                              onClick={() => { onForwardTo(target.id, m.text, agent.name); setSharingMsgId(null); }}
                              className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[9px] hover:bg-white/5 transition-colors"
                              style={{ color: target.color }}
                            >
                              <target.icon size={8} /> {target.name}
                            </button>
                          ))}
                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '2px 0' }} />
                          <button
                            onClick={() => { otherAgents.forEach(t => onForwardTo(t.id, m.text, agent.name)); setSharingMsgId(null); }}
                            className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[9px] hover:bg-white/5 transition-colors"
                            style={{ color: 'rgba(255,255,255,0.45)' }}
                          >
                            <Share2 size={8} /> Broadcast all
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {busy && <div className="flex items-center gap-1 text-[9px] px-2" style={{ color: agent.color }}><Sparkles size={8} className="animate-pulse" /> {agent.name} is thinking...</div>}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button className="flex-shrink-0 rounded-md p-1" style={{ color: 'rgba(255,255,255,0.2)' }}><Mic size={11} /></button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSend(); }} placeholder={`Ask ${agent.name}...`} className="flex-1 min-w-0 text-[10px] px-2 py-1 rounded outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }} />
        <button onClick={handleSend} disabled={!input.trim() || busy} className="flex-shrink-0 rounded-md p-1 disabled:opacity-30" style={{ background: agent.color, color: '#000' }}><Send size={10} /></button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   AGENT CHAT HUB
   ══════════════════════════════════════════════════════════════════════════ */
export function AgentChatHub() {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const active = AGENTS.find(a => a.id === activeAgent);

  // Inject a forwarded message into the target agent's chat history and switch
  // to that agent so the user immediately sees the forwarded context.
  const handleForwardTo = useCallback((targetAgentId: string, text: string, sourceAgentName: string) => {
    const prefix = `📨 Forwarded from ${sourceAgentName}:\n`;
    const forwardedMsg: AgentChatMessage = {
      id: `fwd_${Date.now()}_${targetAgentId}`,
      role: 'user',
      text: prefix + text,
      timestamp: Date.now(),
      agentName: sourceAgentName,
    };
    const all = loadAgentChats();
    all[targetAgentId] = [...(all[targetAgentId] ?? []), forwardedMsg];
    saveAgentChats(all);
    // Switch to the target agent so the user sees the forwarded message.
    setActiveAgent(targetAgentId);
    setMinimized(false);
  }, []);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Agent tabs */}
      <div className="flex gap-1.5 flex-shrink-0">
        {AGENTS.map(agent => {
          const isActive = activeAgent === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => { setActiveAgent(isActive ? null : agent.id); setMinimized(false); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-medium transition-all flex-1"
              style={{
                background: isActive ? `${agent.color}15` : 'rgba(255,255,255,0.03)',
                border: isActive ? `1px solid ${agent.color}40` : '1px solid rgba(255,255,255,0.06)',
                color: isActive ? agent.color : 'rgba(255,255,255,0.4)',
              }}
            >
              <agent.icon size={10} />
              {agent.name}
            </button>
          );
        })}
      </div>

      {/* Active chat panel */}
      <AnimatePresence>
        {activeAgent && active && !minimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'calc(100% - 40px)', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-1 min-h-0"
          >
            <AgentChatPanel key={active.id} agent={active} onClose={() => setActiveAgent(null)} onForwardTo={handleForwardTo} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder when no agent selected */}
      {!activeAgent && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center min-h-[120px]">
          <div className="flex gap-2">
            {AGENTS.map(a => <a.icon key={a.id} size={16} style={{ color: `${a.color}25` }} />)}
          </div>
          <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Select an agent to start collaborating</p>
        </div>
      )}
    </div>
  );
}
