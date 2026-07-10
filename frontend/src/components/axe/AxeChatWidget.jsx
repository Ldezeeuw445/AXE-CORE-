import React, { useEffect, useRef, useState } from "react";
import { TriangleLogo } from "./TriangleLogo";
import { Spinner } from "./Spinner";
import { Minimize2, Send, GripVertical, X, ThumbsUp, ThumbsDown, BookOpen, Upload, XCircle } from "lucide-react";
import { ai, feedback, knowledge } from "../../lib/api";

const STORAGE_KEY = "axe_chat_pos";
const SESSION_KEY = "axe_chat_session";
const MOBILE_BAR_BOTTOM = 76; // px above the dock

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function useIsMobile(breakpoint = 1024) {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const handler = () => setM(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return m;
}

export function AxeChatWidget() {
  const isMobile = useIsMobile(1024);
  const [open, setOpen] = useState(false); // drawer / window open
  const [minimized, setMinimized] = useState(true);
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    if (typeof window === "undefined") return { x: 1200, y: 600 };
    return { x: window.innerWidth - 380, y: window.innerHeight - 480 };
  });
  const [drag, setDrag] = useState(null);
  const [messages, setMessages] = useState([
    { role: "axe", text: "AXE Intelligence online. I see eight live layers. Ask me to correlate, summarize, or interrogate any signal on the board." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));
  const [feedbackGiven, setFeedbackGiven] = useState({}); // message_idx -> rating
  const [showKnowledgePanel, setShowKnowledgePanel] = useState(false);
  const [knowledgeUpload, setKnowledgeUpload] = useState({ title: "", content: "" });
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {} }, [pos]);
  useEffect(() => { if (sessionId) localStorage.setItem(SESSION_KEY, sessionId); }, [sessionId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },
    [messages, busy, open, showKnowledgePanel]);

  // Load knowledge docs when panel opens
  useEffect(() => {
    if (showKnowledgePanel) {
      loadKnowledgeDocs();
    }
  }, [showKnowledgePanel]);

  const loadKnowledgeDocs = async () => {
    try {
      const res = await knowledge.listDocuments();
      if (res?.documents) setKnowledgeDocs(res.documents);
    } catch (e) {
      console.error("loadKnowledgeDocs", e);
    }
  };

  // Drag handlers (desktop only)
  useEffect(() => {
    function onMove(e) {
      if (!drag) return;
      const clientX = e.touches?.[0]?.clientX ?? e.clientX;
      const clientY = e.touches?.[0]?.clientY ?? e.clientY;
      setPos({
        x: clamp(clientX - drag.offsetX, 8, window.innerWidth - 280),
        y: clamp(clientY - drag.offsetY, 8, window.innerHeight - 80),
      });
    }
    function onUp() { setDrag(null); }
    if (drag) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [drag]);

  const startDrag = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    setDrag({ offsetX: clientX - rect.left, offsetY: clientY - rect.top });
  };

  const onSend = async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    const messageId = `msg_${Date.now()}`;
    setMessages((m) => [...m, { role: "operator", text: msg, id: messageId }]);
    setBusy(true);
    if (isMobile && (!open || minimized)) {
      setOpen(true);
      setMinimized(false);
    }
    try {
      const res = await ai.chat(msg, sessionId);
      if (res?.session_id) setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "axe", text: res?.response || "[no response]", id: `axe_${Date.now()}`, replyTo: messageId }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "axe", text: `[error: ${e?.message || "request failed"}]`, id: `axe_${Date.now()}` }]);
    } finally { setBusy(false); }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const openFull = () => { setOpen(true); setMinimized(false); };
  const minimize = () => { setMinimized(true); setOpen(false); };
  const close = () => { setOpen(false); setMinimized(true); };

  const handleFeedback = async (messageIdx, rating) => {
    const msg = messages[messageIdx];
    const prevMsg = messages[messageIdx - 1];
    if (!msg || msg.role !== "axe" || !prevMsg) return;
    
    try {
      await feedback.submit({
        session_id: sessionId || "unknown",
        message_id: msg.id || `msg_${messageIdx}`,
        user_message: prevMsg.text || "",
        axe_response: msg.text || "",
        rating: rating, // 1 = thumbs up, -1 = thumbs down
        category: rating === 1 ? "positive" : "general",
      });
      setFeedbackGiven((prev) => ({ ...prev, [messageIdx]: rating }));
    } catch (e) {
      console.error("feedback submit", e);
    }
  };

  const handleKnowledgeUpload = async () => {
    if (!knowledgeUpload.title.trim() || !knowledgeUpload.content.trim()) return;
    setUploadBusy(true);
    try {
      await knowledge.addDocument({
        title: knowledgeUpload.title,
        content: knowledgeUpload.content,
        doc_type: "note",
        tags: ["operator-note"],
      });
      setKnowledgeUpload({ title: "", content: "" });
      await loadKnowledgeDocs();
    } catch (e) {
      console.error("knowledge upload", e);
    } finally {
      setUploadBusy(false);
    }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await knowledge.deleteDocument(docId);
      await loadKnowledgeDocs();
    } catch (e) {
      console.error("delete doc", e);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      setUploadBusy(true);
      await knowledge.addDocument({
        title: file.name,
        content: text,
        doc_type: "file",
        source: file.name,
        tags: ["uploaded-file"],
      });
      await loadKnowledgeDocs();
    } catch (err) {
      console.error("file upload", err);
    } finally {
      setUploadBusy(false);
    }
  };

  /* =================== KNOWLEDGE PANEL =================== */
  const KnowledgePanel = () => (
    <div className="absolute right-full mr-2 top-0 w-[320px] max-h-[500px] flex flex-col"
         style={{
           background: "#0B0C0E",
           border: "1px solid rgba(0,212,255,0.20)",
           borderRadius: 12,
           boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
         }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-[#00D4FF]" />
          <span className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">KNOWLEDGE BASE</span>
        </div>
        <button onClick={() => setShowKnowledgePanel(false)} className="text-[#6F8193] hover:text-[#FF4D6D]">
          <X size={14} />
        </button>
      </div>
      
      {/* Upload section */}
      <div className="px-3 py-2 border-b border-white/5 space-y-2">
        <input
          type="text"
          placeholder="Note title..."
          value={knowledgeUpload.title}
          onChange={(e) => setKnowledgeUpload((p) => ({ ...p, title: e.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-[#EAF2F7] placeholder-[#6F8193] outline-none focus:border-[#00D4FF]/50"
        />
        <textarea
          placeholder="Paste content or notes here..."
          value={knowledgeUpload.content}
          onChange={(e) => setKnowledgeUpload((p) => ({ ...p, content: e.target.value }))}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-[#EAF2F7] placeholder-[#6F8193] outline-none focus:border-[#00D4FF]/50 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={handleKnowledgeUpload}
            disabled={uploadBusy || !knowledgeUpload.title.trim() || !knowledgeUpload.content.trim()}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-[#00D4FF]/20 border border-[#00D4FF]/30 text-[#00D4FF] text-[10px] font-semibold tracking-[0.06em] uppercase hover:bg-[#00D4FF]/30 transition-colors disabled:opacity-40"
          >
            {uploadBusy ? <Spinner variant="dots" size={10} /> : <Upload size={10} />} Add Note
          </button>
          <label className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-[#9FB0C0] text-[10px] cursor-pointer hover:bg-white/10 transition-colors">
            <Upload size={10} /> File
            <input type="file" accept=".txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>
      
      {/* Documents list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-[100px]">
        {knowledgeDocs.length === 0 && (
          <div className="text-[10px] text-[#6F8193] text-center py-4">
            No documents yet. Add notes or upload files.
          </div>
        )}
        {knowledgeDocs.map((doc) => (
          <div key={doc.doc_id} className="flex items-start gap-2 p-1.5 rounded bg-white/3 border border-white/5 group">
            <BookOpen size={12} className="text-[#00D4FF] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-[#EAF2F7] truncate">{doc.title}</div>
              <div className="text-[9px] text-[#6F8193]">{doc.doc_type} · {doc.chunk_count || 0} chunks</div>
            </div>
            <button
              onClick={() => handleDeleteDoc(doc.doc_id)}
              className="text-[#6F8193] hover:text-[#FF4D6D] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <XCircle size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  /* =================== MOBILE BOTTOM INPUT BAR =================== */
  if (isMobile) {
    return (
      <>
        {/* Always-visible bottom input bar (above the tab dock) */}
        {(!open || minimized) && (
          <div
            data-testid="axe-chat-mobile-bar"
            className="fixed left-0 right-0 z-[55] px-3"
            style={{ bottom: MOBILE_BAR_BOTTOM }}
          >
            <div
              className="flex items-center gap-2 rounded-full pl-2 pr-1 py-1"
              style={{
                background: "rgba(11,12,14,0.96)",
                border: "1px solid rgba(0,212,255,0.28)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.6), 0 0 24px rgba(0,212,255,0.18)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
              }}
            >
              <button
                type="button"
                onClick={openFull}
                aria-label="Open AXE chat"
                className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full"
              >
                <TriangleLogo size={18} animate />
                <span className="text-[10px] font-semibold tracking-[0.10em] text-[#66E6FF]">AXE</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2EF2C2]"
                      style={{ boxShadow: "0 0 8px #2EF2C2" }} />
              </button>
              <input
                ref={inputRef}
                data-testid="axe-chat-mobile-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={openFull}
                onKeyDown={onKey}
                placeholder="Ask AXE about the board…"
                className="flex-1 bg-transparent border-0 outline-none text-[12px] text-[#EAF2F7] placeholder-[#6F8193]"
              />
              <button
                onClick={onSend} disabled={busy || !input.trim()}
                data-testid="axe-chat-mobile-send"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#00D4FF] text-black disabled:opacity-50 disabled:bg-white/10 disabled:text-[#6F8193] transition-colors"
                aria-label="Send"
              >
                {busy ? <Spinner variant="dots" colorClassName="text-black" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* Expanded chat drawer */}
        {open && !minimized && (
          <div
            data-testid="axe-chat-widget"
            className="fixed inset-0 z-[60] flex flex-col"
            style={{
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) minimize(); }}
          >
            <div
              className="mt-auto flex flex-col"
              style={{
                background: "#0B0C0E",
                borderTop: "1px solid rgba(0,212,255,0.30)",
                borderRadius: "18px 18px 0 0",
                maxHeight: "82vh",
                boxShadow: "0 -20px 60px rgba(0,0,0,0.8), 0 -2px 24px rgba(0,212,255,0.10)",
              }}
            >
              {/* Drawer header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
                <TriangleLogo size={20} animate />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">AXE INTELLIGENCE</div>
                  <div className="text-[9px] tracking-[0.14em] uppercase text-[#6F8193] flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2EF2C2]" /> Operator companion
                  </div>
                </div>
                <button onClick={() => setShowKnowledgePanel(!showKnowledgePanel)}
                        className="text-[#6F8193] hover:text-[#00D4FF] p-1" aria-label="Knowledge">
                  <BookOpen size={14} />
                </button>
                <button onClick={minimize} data-testid="axe-chat-minimize-button"
                        className="text-[#6F8193] hover:text-[#66E6FF] p-1" aria-label="Minimize">
                  <Minimize2 size={14} />
                </button>
                <button onClick={close} className="text-[#6F8193] hover:text-[#FF4D6D] p-1" aria-label="Close">
                  <X size={14} />
                </button>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-white/5">
                {[
                  "Correlate the latest sweep",
                  "Why is thermal activity elevated?",
                  "Any cyber+crypto links right now?",
                  "Top 3 actions for an operator?",
                ].map((q) => (
                  <button key={q} onClick={() => setInput(q)}
                          className="text-[10px] tracking-[0.04em] uppercase px-2 py-1 rounded-full bg-white/3 border border-white/8 text-[#9FB0C0] hover:text-[#66E6FF] hover:border-[#00D4FF]/30 transition-colors">
                    {q}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[40vh]"
                   data-testid="axe-chat-messages">
                {messages.map((m, i) => (
                  <Message key={i} role={m.role} text={m.text} messageIdx={i}
                           feedbackGiven={feedbackGiven[i]}
                           onFeedback={(rating) => handleFeedback(i, rating)} />
                ))}
                {busy && (
                  <div className="text-[11px] text-[#9FB0C0] inline-flex items-center gap-2">
                    <Spinner variant="braille" label="AXE reasoning" />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="px-3 py-2 pb-3 border-t border-white/8 flex items-center gap-2"
                   style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
                <input
                  data-testid="axe-chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Ask AXE about the board…"
                  className="axe-input flex-1"
                  autoFocus
                />
                <button onClick={onSend} disabled={busy}
                        data-testid="axe-chat-send-button"
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-[#00D4FF] text-black text-[11px] font-semibold tracking-[0.06em] uppercase hover:bg-[#66E6FF] transition-colors disabled:opacity-60">
                  {busy ? <Spinner variant="dots" colorClassName="text-black" /> : <Send size={12} />} SEND
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* =================== DESKTOP =================== */
  if (!open || minimized) {
    return (
      <button
        onClick={openFull}
        data-testid="axe-chat-pill"
        className="fixed z-[55] inline-flex items-center gap-2 pl-2 pr-3 py-2 rounded-full"
        style={{
          left: pos.x, top: pos.y,
          background: "#0B0C0E", border: "1px solid rgba(0,212,255,0.30)",
          boxShadow: "0 0 24px rgba(0,212,255,0.18), 0 12px 30px rgba(0,0,0,0.55)",
        }}
      >
        <TriangleLogo size={20} animate />
        <span className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">AXE</span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2EF2C2]" style={{ boxShadow: "0 0 8px #2EF2C2" }} />
        <span className="text-[10px] text-[#9FB0C0] hidden sm:inline">INTELLIGENCE</span>
      </button>
    );
  }

  return (
    <div className="fixed z-[55]" style={{ left: pos.x, top: pos.y }}>
      <div className="relative flex">
        {/* Knowledge Panel */}
        {showKnowledgePanel && <KnowledgePanel />}
        
        {/* Main Chat Window */}
        <div
          data-testid="axe-chat-widget"
          className="w-[360px] max-w-[92vw] flex flex-col"
          style={{
            maxHeight: "70vh",
            background: "#0B0C0E", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            boxShadow: "0 18px 50px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,212,255,0.10)",
          }}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
            <button onMouseDown={startDrag} onTouchStart={startDrag}
                    className="cursor-grab active:cursor-grabbing text-[#6F8193] hover:text-[#66E6FF]"
                    aria-label="Drag widget">
              <GripVertical size={14} />
            </button>
            <TriangleLogo size={18} animate />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">AXE INTELLIGENCE</div>
              <div className="text-[9px] tracking-[0.14em] uppercase text-[#6F8193] flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2EF2C2]" /> Operator companion
              </div>
            </div>
            <button onClick={() => setShowKnowledgePanel(!showKnowledgePanel)}
                    className="text-[#6F8193] hover:text-[#00D4FF] p-1" aria-label="Knowledge base"
                    title="Knowledge Base">
              <BookOpen size={14} />
            </button>
            <button onClick={minimize} data-testid="axe-chat-minimize-button"
                    className="text-[#6F8193] hover:text-[#66E6FF] p-1" aria-label="Minimize">
              <Minimize2 size={14} />
            </button>
            <button onClick={close} className="text-[#6F8193] hover:text-[#FF4D6D] p-1" aria-label="Close">
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-white/5">
            {[
              "Correlate the latest sweep",
              "Why is thermal activity elevated?",
              "Any cyber+crypto links right now?",
              "Top 3 actions for an operator?",
            ].map((q) => (
              <button key={q} onClick={() => setInput(q)}
                      className="text-[10px] tracking-[0.04em] uppercase px-2 py-1 rounded-full bg-white/3 border border-white/8 text-[#9FB0C0] hover:text-[#66E6FF] hover:border-[#00D4FF]/30 transition-colors">
                {q}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px]"
               data-testid="axe-chat-messages">
            {messages.map((m, i) => (<Message key={i} role={m.role} text={m.text} messageIdx={i}
                                               feedbackGiven={feedbackGiven[i]}
                                               onFeedback={(rating) => handleFeedback(i, rating)} />))}
            {busy && (
              <div className="text-[11px] text-[#9FB0C0] inline-flex items-center gap-2">
                <Spinner variant="braille" label="AXE reasoning" />
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-white/8 flex items-center gap-2">
            <input
              data-testid="axe-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask AXE about the board…"
              className="axe-input flex-1"
            />
            <button onClick={onSend} disabled={busy}
                    data-testid="axe-chat-send-button"
                    className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-[#00D4FF] text-black text-[11px] font-semibold tracking-[0.06em] uppercase hover:bg-[#66E6FF] transition-colors disabled:opacity-60">
              {busy ? <Spinner variant="dots" colorClassName="text-black" /> : <Send size={12} />} SEND
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ role, text, messageIdx, feedbackGiven, onFeedback }) {
  const isAxe = role === "axe";
  return (
    <div className={`text-[12px] leading-snug rounded-md p-2.5 ${isAxe
      ? "bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.18)] text-[#EAF2F7]"
      : "bg-white/4 border border-white/8 text-[#EAF2F7]"}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[9px] tracking-[0.10em] uppercase"
             style={{ color: isAxe ? "#66E6FF" : "#9FB0C0" }}>
          {isAxe ? "AXE" : "OPERATOR"}
        </div>
        {isAxe && onFeedback && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onFeedback(1)}
              className={`p-0.5 rounded transition-colors ${feedbackGiven === 1 ? "text-[#2EF2C2]" : "text-[#6F8193] hover:text-[#2EF2C2]"}`}
              title="Good response"
            >
              <ThumbsUp size={10} />
            </button>
            <button
              onClick={() => onFeedback(-1)}
              className={`p-0.5 rounded transition-colors ${feedbackGiven === -1 ? "text-[#FF4D6D]" : "text-[#6F8193] hover:text-[#FF4D6D]"}`}
              title="Needs improvement"
            >
              <ThumbsDown size={10} />
            </button>
          </div>
        )}
      </div>
      <div className="whitespace-pre-wrap">{text}</div>
    </div>
  );
}
