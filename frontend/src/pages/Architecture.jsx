import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { TriangleLogo } from "../components/axe/TriangleLogo";
import { Panel, Badge } from "../components/axe/Panel";
import { 
  ArrowLeft, Network, Cpu, Brain, Globe, Code, FileText, Shield,
  Activity, Zap, Server, ChevronRight, Plus, X, Save, GripVertical,
  Bot, Sparkles, Eye, Database
} from "lucide-react";

/* ================================================================
   AXE CORE ARCHITECTURE VISUALIZER
   CrewAI-style interactive architecture diagram
   ================================================================ */

const ARCHITECTURE_LAYERS = {
  interface: {
    label: "INTERFACE",
    color: "#00D4FF",
    items: [
      { id: "axe-chat", name: "AXE Chat Widget", icon: Bot, role: "Primary interface — operator talks to AXE", prompt: "You are AXE, an intelligence orchestrator...", health: "ok", memory: "session-based", skills: ["chat", "route"] },
      { id: "terminal", name: "Intelligence Terminal", icon: Eye, role: "OSINT dashboard with 8 live layers", prompt: "Stream and correlate intelligence feeds...", health: "ok", memory: "real-time", skills: ["sweep", "correlate", "alert"] },
      { id: "browser", name: "In-App Browser", icon: Globe, role: "Web scraping and page analysis", prompt: "Fetch and analyze web pages...", health: "ok", memory: "per-session", skills: ["fetch", "analyze", "search"] },
      { id: "code-editor", name: "Code Editor", icon: Code, role: "Edit code for all 3 apps", prompt: "Help edit and review code...", health: "ok", memory: "file-context", skills: ["edit", "review", "debug"] },
    ]
  },
  orchestrator: {
    label: "ORCHESTRATOR",
    color: "#A78BFA",
    items: [
      { id: "langgraph", name: "LangGraph Orchestrator", icon: Network, role: "Routes tasks to specialists via capability router", prompt: "Analyze intent and route to best specialist...", health: "ok", memory: "conversation-history", skills: ["route", "plan", "delegate"] },
      { id: "capability-router", name: "Capability Router", icon: Sparkles, role: "Chooses best provider/agent per task", prompt: "Score each provider for this task...", health: "ok", memory: "performance-log", skills: ["score", "select", "fallback"] },
      { id: "approval-gate", name: "Approval Gate", icon: Shield, role: "AXE asks operator before executing", prompt: "Summarize proposed action and ask approval...", health: "ok", memory: "approval-history", skills: ["summarize", "ask-approval", "log"] },
    ]
  },
  specialists: {
    label: "SPECIALISTS",
    color: "#2EF2C2",
    items: [
      { id: "kimi-claw", name: "KimiClaw", icon: Globe, role: "Web intelligence & browser automation", prompt: "Search the web, analyze pages, extract data...", health: "ok", memory: "search-history", skills: ["web-search", "scrape", "analyze"] },
      { id: "kimi-code", name: "Kimi Code", icon: Code, role: "Code generation, review & debugging", prompt: "Write clean, documented code...", health: "ok", memory: "code-context", skills: ["generate", "review", "debug", "refactor"] },
      { id: "kimi-work", name: "Kimi Work", icon: FileText, role: "Document analysis & productivity", prompt: "Analyze documents and extract insights...", health: "ok", memory: "doc-context", skills: ["summarize", "extract", "compare"] },
      { id: "code-agent", name: "Code Agent", icon: Cpu, role: "Trusted code assistant with self-improvement", prompt: "You are a trusted code agent...", health: "ok", memory: "project-knowledge", skills: ["code", "test", "document", "learn"] },
    ]
  },
  providers: {
    label: "PROVIDERS",
    color: "#FF7A45",
    items: [
      { id: "ollama", name: "Ollama (Local)", icon: Server, role: "Self-hosted LLMs on VPS", prompt: "Run local inference...", health: "ok", memory: "model-cache", skills: ["inference", "embed"] },
      { id: "openai", name: "OpenAI", icon: Brain, role: "GPT-4o, GPT-4o-mini via API", prompt: "Use GPT-4o for complex tasks...", health: "ok", memory: "api-state", skills: ["chat", "embed", "vision"] },
      { id: "anthropic", name: "Anthropic", icon: Brain, role: "Claude Sonnet/Opus via API", prompt: "Use Claude for analysis tasks...", health: "ok", memory: "api-state", skills: ["chat", "analysis", "coding"] },
    ]
  },
  data: {
    label: "DATA",
    color: "#66E6FF",
    items: [
      { id: "supabase", name: "Supabase", icon: Database, role: "PostgreSQL + Auth + Realtime", prompt: "Store user data, chat history, RAG...", health: "ok", memory: "persistent", skills: ["db", "auth", "realtime"] },
      { id: "rag", name: "RAG Knowledge Base", icon: Database, role: "Per-user vector search & memory", prompt: "Store and retrieve knowledge...", health: "ok", memory: "vector-store", skills: ["embed", "search", "recall"] },
      { id: "feedback-loop", name: "Self-Improvement Loop", icon: Activity, role: "Learn from feedback, adapt prompts", prompt: "Analyze feedback and improve...", health: "ok", memory: "adaptation-log", skills: ["learn", "adapt", "improve"] },
    ]
  },
};

const CONNECTIONS = [
  ["axe-chat", "langgraph"], ["terminal", "langgraph"], ["browser", "kimi-claw"],
  ["code-editor", "code-agent"], ["langgraph", "capability-router"],
  ["capability-router", "approval-gate"], ["approval-gate", "kimi-claw"],
  ["approval-gate", "kimi-code"], ["approval-gate", "kimi-work"],
  ["approval-gate", "code-agent"], ["kimi-claw", "ollama"],
  ["kimi-code", "openai"], ["kimi-work", "anthropic"], ["code-agent", "openai"],
  ["ollama", "supabase"], ["openai", "supabase"], ["anthropic", "rag"],
  ["feedback-loop", "langgraph"],
];

export default function Architecture() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedLayers, setExpandedLayers] = useState({ interface: true, orchestrator: true, specialists: true, providers: true, data: true });
  const [editMode, setEditMode] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const canvasRef = useRef(null);

  const toggleLayer = (layerKey) => {
    setExpandedLayers(prev => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setEditPrompt(node.prompt);
    setEditMode(false);
  };

  const savePrompt = () => {
    if (selectedNode) {
      selectedNode.prompt = editPrompt;
      setEditMode(false);
    }
  };

  const addSkill = () => {
    if (selectedNode && newSkill.trim()) {
      selectedNode.skills.push(newSkill.trim());
      setNewSkill("");
    }
  };

  const removeSkill = (skillIdx) => {
    if (selectedNode) {
      selectedNode.skills.splice(skillIdx, 1);
    }
  };

  return (
    <div className="min-h-screen bg-black text-[#EAF2F7]" data-testid="architecture-page">
      {/* Top Bar */}
      <header className="axe-topbar px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[#6F8193] hover:text-[#66E6FF] inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.10em]">
            <ArrowLeft size={14}/> TERMINAL
          </Link>
          <span className="text-[#6F8193]">/</span>
          <Network size={14} className="text-[#A78BFA]" />
          <span className="text-[12px] font-semibold tracking-[0.16em]">ARCHITECTURE</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#6F8193]">
          <span className="text-[#A78BFA]">{Object.values(ARCHITECTURE_LAYERS).reduce((a, l) => a + l.items.length, 0)} nodes</span>
          <span>·</span>
          <span>{CONNECTIONS.length} connections</span>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          {/* LEFT: Architecture Canvas */}
          <div>
            <div className="mb-4 flex items-center gap-2 text-[10px] text-[#6F8193]">
              <Sparkles size={10} className="text-[#A78BFA]" />
              Click any node to view details, edit prompt, manage skills, and check health
            </div>

            {/* Layer Stacks */}
            <div className="space-y-3" ref={canvasRef}>
              {Object.entries(ARCHITECTURE_LAYERS).map(([key, layer]) => (
                <div key={key} className="relative">
                  {/* Layer Header */}
                  <button onClick={() => toggleLayer(key)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-t-md border border-white/8"
                    style={{ background: `${layer.color}10`, borderBottom: expandedLayers[key] ? "none" : `1px solid ${layer.color}30` }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: layer.color, boxShadow: `0 0 6px ${layer.color}` }} />
                    <span className="text-[11px] font-semibold tracking-[0.10em]" style={{ color: layer.color }}>{layer.label}</span>
                    <span className="text-[9px] text-[#6F8193] ml-auto">{layer.items.length} nodes</span>
                  </button>

                  {/* Layer Nodes */}
                  {expandedLayers[key] && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 border border-t-0 border-white/8 rounded-b-md"
                      style={{ background: "#0B0C0E" }}>
                      {layer.items.map((item) => (
                        <button key={item.id} onClick={() => handleNodeClick(item)}
                          className={`flex items-start gap-2.5 p-2.5 rounded-md border transition-all text-left hover:border-[${layer.color}]40 group`}
                          style={{
                            background: selectedNode?.id === item.id ? `${layer.color}10` : "rgba(255,255,255,0.02)",
                            borderColor: selectedNode?.id === item.id ? `${layer.color}40` : "rgba(255,255,255,0.06)",
                          }}>
                          <div className="mt-0.5 p-1.5 rounded" style={{ background: `${layer.color}15` }}>
                            <item.icon size={14} style={{ color: layer.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium text-[#EAF2F7] truncate">{item.name}</span>
                              <div className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: item.health === "ok" ? "#2EF2C2" : "#FF4D6D", boxShadow: item.health === "ok" ? "0 0 6px #2EF2C2" : "0 0 6px #FF4D6D" }} />
                            </div>
                            <div className="text-[9px] text-[#6F8193] mt-0.5 truncate">{item.role}</div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.skills.slice(0, 3).map(s => (
                                <span key={s} className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-[#9FB0C0] border border-white/8">{s}</span>
                              ))}
                              {item.skills.length > 3 && <span className="text-[8px] text-[#6F8193]">+{item.skills.length - 3}</span>}
                            </div>
                          </div>
                          <ChevronRight size={12} className="text-[#6F8193] group-hover:text-[#EAF2F7] shrink-0 mt-1" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Connection Legend */}
            <div className="mt-4 p-3 rounded-md border border-white/8 bg-[#0B0C0E]">
              <div className="text-[10px] font-semibold text-[#6F8193] uppercase tracking-wider mb-2">Data Flow</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { color: "#00D4FF", label: "User Input" },
                  { color: "#A78BFA", label: "Orchestration" },
                  { color: "#2EF2C2", label: "Execution" },
                  { color: "#FF7A45", label: "LLM Provider" },
                  { color: "#66E6FF", label: "Storage" },
                ].map(c => (
                  <div key={c.label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: c.color, boxShadow: `0 0 4px ${c.color}` }} />
                    <span className="text-[9px] text-[#9FB0C0]">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Node Detail Panel */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            {selectedNode ? (
              <Panel title={selectedNode.name} right={
                <Badge tone={selectedNode.health === "ok" ? "ok" : "error"}>{selectedNode.health.toUpperCase()}</Badge>
              }>
                <div className="space-y-4">
                  {/* Role */}
                  <div>
                    <label className="text-[9px] text-[#6F8193] uppercase tracking-wider">Role</label>
                    <p className="text-[11px] text-[#EAF2F7] mt-1">{selectedNode.role}</p>
                  </div>

                  {/* Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[9px] text-[#6F8193] uppercase tracking-wider">System Prompt</label>
                      <button onClick={() => setEditMode(!editMode)}
                        className="text-[9px] text-[#00D4FF] hover:text-[#66E6FF] tracking-wider uppercase">
                        {editMode ? "Cancel" : "Edit"}
                      </button>
                    </div>
                    {editMode ? (
                      <div>
                        <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)}
                          rows={6} className="axe-input w-full text-[10px] font-mono" />
                        <button onClick={savePrompt}
                          className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-[#00D4FF] text-black text-[9px] font-semibold uppercase">
                          <Save size={10} /> Save Prompt
                        </button>
                      </div>
                    ) : (
                      <div className="p-2 rounded bg-white/3 border border-white/5 text-[10px] text-[#9FB0C0] font-mono leading-relaxed max-h-[120px] overflow-y-auto">
                        {selectedNode.prompt}
                      </div>
                    )}
                  </div>

                  {/* Memory */}
                  <div>
                    <label className="text-[9px] text-[#6F8193] uppercase tracking-wider">Memory Type</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Database size={12} className="text-[#A78BFA]" />
                      <span className="text-[11px] text-[#EAF2F7]">{selectedNode.memory}</span>
                    </div>
                  </div>

                  {/* Skills */}
                  <div>
                    <label className="text-[9px] text-[#6F8193] uppercase tracking-wider mb-1 block">Skills</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedNode.skills.map((skill, i) => (
                        <span key={skill} className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[#00D4FF]">
                          {skill}
                          <button onClick={() => removeSkill(i)} className="hover:text-[#FF4D6D]"><X size={8} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <input value={newSkill} onChange={e => setNewSkill(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addSkill()}
                        placeholder="Add skill..." className="axe-input flex-1 text-[10px]" />
                      <button onClick={addSkill}
                        className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[#9FB0C0] hover:text-[#00D4FF] transition-colors">
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>
            ) : (
              <div className="axe-panel p-8 text-center">
                <Network size={32} className="text-[#6F8193] mx-auto mb-3" />
                <div className="text-[12px] font-medium text-[#9FB0C0]">Select a node</div>
                <div className="text-[10px] text-[#6F8193] mt-1">Click any component to view details, edit prompts, and manage skills</div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
