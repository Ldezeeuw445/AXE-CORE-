import React, { useEffect, useRef, useState } from "react";
import { TriangleLogo } from "./TriangleLogo";
import { Spinner } from "./Spinner";
import { Minimize2, Send, GripVertical, X, ThumbsUp, ThumbsDown, BookOpen, Upload, XCircle, Globe, Code, FileText, Image, Paperclip, Mic } from "lucide-react";
import { ai, feedback, knowledge, kimi } from "../../lib/api";
import { useNotification } from "../../contexts/NotificationContext";

const STORAGE_KEY = "axe_chat_pos";
const SESSION_KEY = "axe_chat_session";
const CHAT_HISTORY_KEY = "axe_chat_history";

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
  const { notify } = useNotification();
  const [open, setOpen] = useState(false);
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
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_HISTORY_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      { role: "axe", text: "AXE Intelligence online. I see eight live layers. Ask me to correlate, summarize, or interrogate any signal on the board.\\n\\nUse /claw for web tasks, /code for coding, /work for documents. Upload files or images directly in chat." },
    ];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const [showKnowledgePanel, setShowKnowledgePanel] = useState(false);
  const [knowledgeUpload, setKnowledgeUpload] = useState({ title: "", content: "" });
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [activeKimi, setActiveKimi] = useState(null);
  const [kimiModels, setKimiModels] = useState([]);
  const [filePreview, setFilePreview] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Persist chat history
  useEffect(() => {
    try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages.slice(-100))); } catch {}
  }, [messages]);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {} }, [pos]);
  useEffect(() => { if (sessionId) localStorage.setItem(SESSION_KEY, sessionId); }, [sessionId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },
    [messages, busy, open, showKnowledgePanel]);

  useEffect(() => { if (showKnowledgePanel) loadKnowledgeDocs(); }, [showKnowledgePanel]);

  useEffect(() => {
    kimi.models().then((res) => {
      if (res?.variants) setKimiModels(res.variants);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleFocusChat = (e) => {
      setOpen(true);
      setMinimized(false);
      if (e.detail) {
        setInput(e.detail);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };
    window.addEventListener("axe-focus-chat", handleFocusChat);
    return () => window.removeEventListener("axe-focus-chat", handleFocusChat);
  }, []);

  const loadKnowledgeDocs = async () => {
    try {
      const res = await knowledge.listDocuments();
      if (res?.documents) setKnowledgeDocs(res.documents);
    } catch (e) { console.error("loadKnowledgeDocs", e); }
  };

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

  // Parse commands: /claw, /code, /work
  const parseCommand = (text) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("/claw ")) return { variant: "claw", message: trimmed.slice(6) };
    if (trimmed.startsWith("/code ")) return { variant: "code", message: trimmed.slice(6) };
    if (trimmed.startsWith("/work ")) return { variant: "work", message: trimmed.slice(6) };
    return null;
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();

    reader.onload = async () => {
      const result = reader.result;
      const fileData = {
        name: file.name,
        type: file.type,
        size: file.size,
        content: result,
        isImage,
      };
      setFilePreview(fileData);
    };

    if (isImage) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  };

  const sendFileInChat = async () => {
    if (!filePreview) return;
    const messageId = `msg_${Date.now()}`;

    if (filePreview.isImage) {
      setMessages(m => [...m, {
        role: "operator",
        text: `[Image: ${filePreview.name}]`,
        id: messageId,
        imageData: filePreview.content,
      }]);
    } else {
      setMessages(m => [...m, {
        role: "operator",
        text: `[File: ${filePreview.name}]\\n\\n${filePreview.content.substring(0, 2000)}${filePreview.content.length > 2000 ? "..." : ""}`,
        id: messageId,
      }]);
    }

    setBusy(true);
    try {
      const contextMsg = filePreview.isImage
        ? `The user uploaded an image: ${filePreview.name}. Please analyze and describe what you see.`
        : `The user uploaded a file: ${filePreview.name}. Here's the content:\\n\\n${filePreview.content.substring(0, 4000)}`;

      const res = await ai.chat(contextMsg, sessionId);
      if (res?.session_id) setSessionId(res.session_id);
      setMessages(m => [...m, {
        role: "axe",
        text: res?.response || "[no response]",
        id: `axe_${Date.now()}`,
        replyTo: messageId,
      }]);
    } catch (e) {
      notify.error(`File analysis error: ${e?.message || "request failed"}`);
      setMessages(m => [...m, { role: "axe", text: `[error: ${e?.message || "request failed"}]`, id: `axe_${Date.now()}` }]);
    } finally {
      setBusy(false);
      setFilePreview(null);
    }
  };

  const onSend = async () => {
    const msg = input.trim();
    if (!msg || busy) return;

    if (filePreview) {
      await sendFileInChat();
      return;
    }

    setInput("");
    const messageId = `msg_${Date.now()}`;
    setMessages((m) => [...m, { role: "operator", text: msg, id: messageId }]);
    setBusy(true);
    if (isMobile && (!open || minimized)) { setOpen(true); setMinimized(false); }

    try {
      const command = parseCommand(msg);
      if (command) {
        setActiveKimi(command.variant);
        notify.info(`Asking Kimi ${command.variant}...`, 2000);
        let res;
        if (command.variant === "claw") {
          res = await kimi.browser(command.message);
        } else if (command.variant === "code") {
          res = await kimi.code(command.message);
        } else if (command.variant === "work") {
          res = await kimi.work(command.message);
        }
        const responseText = res?.response || res?.error || `[${command.variant}] No response`;
        if (res?.status === "ok") {
          notify.success(`Kimi ${command.variant} responded`);
        } else {
          notify.error(`Kimi ${command.variant} error: ${res?.error || "Unknown"}`);
        }
        setMessages((m) => [...m, {
          role: "axe",
          text: `[Kimi${command.variant.charAt(0).toUpperCase() + command.variant.slice(1)}] ${responseText}`,
          id: `axe_${Date.now()}`,
          replyTo: messageId,
          kimiVariant: command.variant,
        }]);
      } else {
        const res = await ai.chat(msg, sessionId);
        if (res?.session_id) setSessionId(res.session_id);
        setMessages((m) => [...m, {
          role: "axe",
          text: res?.response || "[no response]",
          id: `axe_${Date.now()}`,
          replyTo: messageId,
        }]);
      }
    } catch (e) {
      notify.error(`Chat error: ${e?.message || "request failed"}`);
      setMessages((m) => [...m, {
        role: "axe",
        text: `[error: ${e?.message || "request failed"}]`,
        id: `axe_${Date.now()}`,
      }]);
    } finally { setBusy(false); setActiveKimi(null); }
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
        rating: rating,
        category: rating === 1 ? "positive" : "general",
      });
      setFeedbackGiven((prev) => ({ ...prev, [messageIdx]: rating }));
      notify.success(rating === 1 ? "Thanks for the positive feedback!" : "Thanks for the feedback — AXE will improve");
    } catch (e) {
      notify.error("Failed to submit feedback");
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
      notify.success(`Note "${knowledgeUpload.title}" added to knowledge base`);
    } catch (e) {
      notify.error("Failed to add note");
      console.error("knowledge upload", e);
    } finally { setUploadBusy(false); }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await knowledge.deleteDocument(docId);
      await loadKnowledgeDocs();
      notify.success("Document deleted");
    } catch (e) {
      notify.error("Failed to delete document");
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
        title: file.name, content: text, doc_type: "file",
        source: file.name, tags: ["uploaded-file"],
      });
      await loadKnowledgeDocs();
      notify.success(`File "${file.name}" uploaded to knowledge base`);
    } catch (err) {
      notify.error("Failed to upload file");
      console.error("file upload", err);
    } finally { setUploadBusy(false); }
  };

  const insertCommand = (cmd) => {
    setInput((prev) => {
      const base = prev.trim();
      return base ? `${base} ${cmd}` : cmd;
    });
    inputRef.current?.focus();
  };

  const clearHistory = () => {
    setMessages([
      { role: "axe", text: "Chat history cleared. How can I help?" },
    ]);
    localStorage.removeItem(CHAT_HISTORY_KEY);
    notify.success("Chat history cleared");
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
      <div className="px-3 py-2 border-b border-white/5 space-y-2">
        <input type="text" placeholder="Note title..."
          value={knowledgeUpload.title}
          onChange={(e) => setKnowledgeUpload((p) => ({ ...p, title: e.target.value }))}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-[#EAF2F7] placeholder-[#6F8193] outline-none focus:border-[#00D4FF]/50" />
        <textarea placeholder="Paste content or notes here..."
          value={knowledgeUpload.content}
          onChange={(e) => setKnowledgeUpload((p) => ({ ...p, content: e.target.value }))}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-[#EAF2F7] placeholder-[#6F8193] outline-none focus:border-[#00D4FF]/50 resize-none" />
        <div className="flex gap-2">
          <button onClick={handleKnowledgeUpload}
            disabled={uploadBusy || !knowledgeUpload.title.trim() || !knowledgeUpload.content.trim()}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-[#00D4FF]/20 border border-[#00D4FF]/30 text-[#00D4FF] text-[10px] font-semibold tracking-[0.06em] uppercase hover:bg-[#00D4FF]/30 transition-colors disabled:opacity-40">
            {uploadBusy ? <Spinner variant="dots" size={10} /> : <Upload size={10} />} Add Note
          </button>
          <label className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-[#9FB0C0] text-[10px] cursor-pointer hover:bg-white/10 transition-colors">
            <Upload size={10} /> File
            <input type="file" accept=".txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>
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
            <button onClick={() => handleDeleteDoc(doc.doc_id)}
              className="text-[#6F8193] hover:text-[#FF4D6D] opacity-0 group-hover:opacity-100 transition-opacity">
              <XCircle size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  /* =================== KIMI TOOLBAR =================== */
  const KimiToolbar = () => (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5">
      <span className="text-[9px] text-[#6F8193] uppercase tracking-wider mr-1">Kimi:</span>
      {[
        { id: "claw", icon: Globe, label: "Claw", color: "#00D4FF", cmd: "/claw " },
        { id: "code", icon: Code, label: "Code", color: "#2EF2C2", cmd: "/code " },
        { id: "work", icon: FileText, label: "Work", color: "#A78BFA", cmd: "/work " },
      ].map((tool) => (
        <button key={tool.id} onClick={() => insertCommand(tool.cmd)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-colors"
          style={{
            color: activeKimi === tool.id ? tool.color : "#6F8193",
            background: activeKimi === tool.id ? `${tool.color}15` : "transparent",
            border: `1px solid ${activeKimi === tool.id ? `${tool.color}40` : "rgba(255,255,255,0.08)"}`,
          }}>
          <tool.icon size={10} /> {tool.label}
        </button>
      ))}
    </div>
  );

  /* =================== DESKTOP PILL =================== */
  if (!open || minimized) {
    return (
      <button onClick={openFull} data-testid="axe-chat-pill"
        className="fixed z-[55] inline-flex items-center gap-2 pl-2 pr-3 py-2 rounded-full"
        style={{
          left: pos.x, top: pos.y,
          background: "#0B0C0E", border: "1px solid rgba(0,212,255,0.30)",
          boxShadow: "0 0 24px rgba(0,212,255,0.18), 0 12px 30px rgba(0,0,0,0.55)",
        }}>
        <TriangleLogo size={20} animate />
        <span className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">AXE</span>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2EF2C2]" style={{ boxShadow: "0 0 8px #2EF2C2" }} />
        <span className="text-[10px] text-[#9FB0C0] hidden sm:inline">INTELLIGENCE</span>
      </button>
    );
  }

  /* =================== DESKTOP CHAT =================== */
  return (
    <div className="fixed z-[55]" style={{ left: pos.x, top: pos.y }}>
      <div className="relative flex">
        {showKnowledgePanel && <KnowledgePanel />}
        <div data-testid="axe-chat-widget" className="w-[420px] max-w-[92vw] flex flex-col"
          style={{
            maxHeight: "75vh",
            background: "#0B0C0E", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            boxShadow: "0 18px 50px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,212,255,0.10)",
          }}>
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
            <button onClick={clearHistory} className="text-[#6F8193] hover:text-[#FFCC66] p-1" title="Clear history">
              <X size={12} />
            </button>
            <button onClick={() => setShowKnowledgePanel(!showKnowledgePanel)}
              className="text-[#6F8193] hover:text-[#00D4FF] p-1" title="Knowledge Base">
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

          <KimiToolbar />

          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-white/5">
            {[
              "Correlate the latest sweep",
              "/claw Search for recent cyber attacks",
              "/code Write a Python scraper",
              "/work Summarize this conversation",
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
              onFeedback={(rating) => handleFeedback(i, rating)}
              kimiVariant={m.kimiVariant}
              imageData={m.imageData} />))}
            {busy && (
              <div className="text-[11px] text-[#9FB0C0] inline-flex items-center gap-2">
                <Spinner variant="braille" label="AXE reasoning" />
                {activeKimi && <span className="text-[#00D4FF]"> via Kimi{activeKimi}</span>}
              </div>
            )}
          </div>

          {/* File Preview */}
          {filePreview && (
            <div className="px-3 py-2 border-t border-white/5 flex items-center gap-2">
              {filePreview.isImage ? (
                <img src={filePreview.content} alt={filePreview.name} className="w-12 h-12 rounded object-cover border border-white/10" />
              ) : (
                <Paperclip size={16} className="text-[#00D4FF]" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[#EAF2F7] truncate">{filePreview.name}</div>
                <div className="text-[9px] text-[#6F8193]">{(filePreview.size / 1024).toFixed(1)} KB</div>
              </div>
              <button onClick={() => setFilePreview(null)} className="text-[#6F8193] hover:text-[#FF4D6D]">
                <X size={12} />
              </button>
              <button onClick={sendFileInChat} disabled={busy}
                className="px-2 py-1 rounded bg-[#00D4FF] text-black text-[9px] font-semibold uppercase hover:bg-[#66E6FF] transition-colors disabled:opacity-50">
                Send
              </button>
            </div>
          )}

          <div className="px-3 py-2 border-t border-white/8 flex items-center gap-2">
            <label className="text-[#6F8193] hover:text-[#00D4FF] cursor-pointer p-1 transition-colors" title="Upload file or image">
              <Image size={16} />
              <input type="file" ref={fileInputRef} onChange={handleFileSelect}
                accept="image/*,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.py,.pdf,.doc,.docx"
                className="hidden" />
            </label>
            <input ref={inputRef}
              data-testid="axe-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={filePreview ? "Add a message or send file..." : "Ask AXE, or use /claw, /code, /work..."}
              className="axe-input flex-1"
            />
            <button onClick={onSend} disabled={busy && !filePreview}
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

function Message({ role, text, messageIdx, feedbackGiven, onFeedback, kimiVariant, imageData }) {
  const isAxe = role === "axe";
  const variantColors = {
    claw: "#00D4FF",
    code: "#2EF2C2",
    work: "#A78BFA",
  };
  const vColor = kimiVariant ? variantColors[kimiVariant] : null;

  return (
    <div className={`text-[12px] leading-snug rounded-md p-2.5 ${isAxe
      ? "bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.18)] text-[#EAF2F7]"
      : "bg-white/4 border border-white/8 text-[#EAF2F7]"}`}
      style={vColor ? { borderLeft: `3px solid ${vColor}` } : {}}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className="text-[9px] tracking-[0.10em] uppercase"
            style={{ color: vColor || (isAxe ? "#66E6FF" : "#9FB0C0") }}>
            {kimiVariant ? `Kimi ${kimiVariant.charAt(0).toUpperCase() + kimiVariant.slice(1)}` : (isAxe ? "AXE" : "OPERATOR")}
          </div>
          {kimiVariant && (
            <span className="text-[8px] px-1 py-0.5 rounded" style={{
              background: `${vColor}15`, color: vColor, border: `1px solid ${vColor}30`
            }}>
              {kimiVariant}
            </span>
          )}
        </div>
        {isAxe && onFeedback && (
          <div className="flex items-center gap-1">
            <button onClick={() => onFeedback(1)}
              className={`p-0.5 rounded transition-colors ${feedbackGiven === 1 ? "text-[#2EF2C2]" : "text-[#6F8193] hover:text-[#2EF2C2]"}`}
              title="Good response">
              <ThumbsUp size={10} />
            </button>
            <button onClick={() => onFeedback(-1)}
              className={`p-0.5 rounded transition-colors ${feedbackGiven === -1 ? "text-[#FF4D6D]" : "text-[#6F8193] hover:text-[#FF4D6D]"}`}
              title="Needs improvement">
              <ThumbsDown size={10} />
            </button>
          </div>
        )}
      </div>
      {imageData && (
        <img src={imageData} alt="Uploaded" className="max-w-[200px] max-h-[150px] rounded-md mb-2 border border-white/10 object-cover" />
      )}
      <div className="whitespace-pre-wrap">{text}</div>
    </div>
  );
}
