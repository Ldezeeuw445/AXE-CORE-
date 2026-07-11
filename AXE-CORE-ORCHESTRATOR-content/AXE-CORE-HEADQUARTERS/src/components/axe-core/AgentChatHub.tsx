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
  ChevronRight, Sparkles, GripVertical,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface AgentChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
  agentName: string;
}

interface AgentDef {
  id: string;
  name: string;
  role: string;
  icon: React.ElementType;
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
function saveAgentChats(chats: Record<string, AgentChatMessage[]>) { localStorage.setItem(CHATS_KEY, JSON.stringify(chats)); }

/* ─── Simulated Agent Response ─────────────────────────────────────────── */
async function getAgentResponse(agent: AgentDef, userText: string, sharedContext: string): Promise<string> {
  // Check for cross-agent collaboration triggers
  const lower = userText.toLowerCase();
  if (agent.id === 'kimiclaw' && (lower.includes('code') || lower.includes('script') || lower.includes('program'))) {
    return `[KimiClaw] I'll search for relevant code examples.\n\n**Found patterns:**\n• Error handling in TypeScript\n• API fetch wrappers\n\n*Tip: Ask KimiCode for a complete implementation — I've shared the search results with him.*`;
  }
  if (agent.id === 'kimicode' && (lower.includes('search') || lower.includes('find') || lower.includes('lookup'))) {
    return `[KimiCode] I'll write the code.\n\n\`\`\`typescript\n// Search + fetch utility\nasync function searchAndFetch(query: string) {\n  const searchRes = await fetch(\`/api/search?q=\${encodeURIComponent(query)}\`);\n  const results = await searchRes.json();\n  return Promise.all(\n    results.map((r: { url: string }) => fetch(r.url).then(r => r.text()))\n  );\n}\n\`\`\`\n\n*KimiClaw can verify these URLs are live before we deploy.*`;
  }
  if (agent.id === 'kimiwork' && (lower.includes('code') || lower.includes('data'))) {
    return `[KimiWork] Analyzing the data patterns...\n\n**Insights:**\n• 3 common patterns detected\n• Suggest caching layer for repeated queries\n• Estimated 40% performance gain\n\n*I've shared these findings with KimiCode for implementation.*`;
  }

  // Default responses
  const responses: Record<string, string[]> = {
    kimiclaw: [
      `Searched 12 sources. Top result: relevant documentation found. Want me to fetch the full page?`,
      `Found 5 matching articles. Key insight: the approach you're looking for is documented in the official API reference.`,
      `Web scan complete. 3 authoritative sources confirm this pattern. Shall I extract the key sections?`,
    ],
    kimicode: [
      `Here's the solution:\n\n\`\`\`typescript\n// Clean implementation\nconst solution = async () => {\n  const result = await processData();\n  return optimize(result);\n};\n\`\`\`\nTested and ready to deploy.`,
      `Code review complete. 2 suggestions:\n1. Add input validation\n2. Use streaming for large datasets\n\nWant me to implement both?`,
      `Refactored for clarity. Reduced from 45 to 12 lines with better error handling.`,
    ],
    kimiwork: [
      `Analysis complete. Key findings:\n• Trend shows 23% improvement\n• Bottleneck identified in step 3\n• Recommended: parallel processing\n\nFull report ready.`,
      `Data processed across 4 dimensions. Outlier detected in region 2 — worth investigating.`,
      `Comparative analysis done. Your approach scores 8.5/10. Main gap: missing edge case handling.`,
    ],
  };
  const pool = responses[agent.id] || ['Processing complete.'];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ─── Single Agent Chat Panel ──────────────────────────────────────────── */
function AgentChatPanel({
  agent, onClose,
}: {
  agent: AgentDef;
  onClose: () => void;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const all = loadAgentChats();
    all[agent.id] = messages;
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

    // Build context from RAG files
    const ragContext = ragFiles.map(f => `[FILE: ${f.name}]\n${f.content.slice(0, 500)}`).join('\n\n');
    const sharedMem = loadSharedMemory().slice(0, 5).map(m => `[${m.agentName}] ${m.content}`).join('\n');
    const fullContext = `${sharedMem}\n\n${ragContext}`.trim();

    // Simulate response
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    const response = await getAgentResponse(agent, text, fullContext);

    const agentMsg: AgentChatMessage = {
      id: `msg_${Date.now() + 1}`, role: 'agent', text: response, timestamp: Date.now(), agentName: agent.name,
    };
    setMessages(prev => [...prev, agentMsg]);
    setBusy(false);

    // Add response to shared memory
    addMemory({ agentId: agent.id, agentName: agent.name, content: response.slice(0, 200), type: 'insight' });
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
          return (
            <div key={m.id} className={`flex gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="mt-0.5 flex-shrink-0">{isUser ? <User size={9} style={{ color: 'rgba(255,255,255,0.3)' }} /> : <Bot size={9} style={{ color: agent.color }} />}</div>
              <div className="max-w-[85%] rounded px-2 py-1 text-[9px] leading-snug whitespace-pre-wrap" style={{ background: isUser ? `${agent.color}15` : 'rgba(255,255,255,0.04)', color: isUser ? '#fff' : 'rgba(255,255,255,0.7)', borderLeft: isUser ? 'none' : `2px solid ${agent.color}40` }}>
                {m.text}
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
            <AgentChatPanel agent={active} onClose={() => setActiveAgent(null)} />
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
