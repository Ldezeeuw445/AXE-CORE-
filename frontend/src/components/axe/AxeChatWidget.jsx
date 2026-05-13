import React, { useEffect, useRef, useState } from "react";
import { TriangleLogo } from "./TriangleLogo";
import { Spinner } from "./Spinner";
import { Minimize2, Send, GripVertical, X } from "lucide-react";
import { ai } from "../../lib/api";

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
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {} }, [pos]);
  useEffect(() => { if (sessionId) localStorage.setItem(SESSION_KEY, sessionId); }, [sessionId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },
    [messages, busy, open]);

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
    setMessages((m) => [...m, { role: "operator", text: msg }]);
    setBusy(true);
    if (isMobile && (!open || minimized)) {
      setOpen(true);
      setMinimized(false);
    }
    try {
      const res = await ai.chat(msg, sessionId);
      if (res?.session_id) setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "axe", text: res?.response || "[no response]" }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "axe", text: `[error: ${e?.message || "request failed"}]` }]);
    } finally { setBusy(false); }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const openFull = () => { setOpen(true); setMinimized(false); };
  const minimize = () => { setMinimized(true); setOpen(false); };
  const close = () => { setOpen(false); setMinimized(true); };

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
                  <Message key={i} role={m.role} text={m.text} />
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
    <div
      data-testid="axe-chat-widget"
      className="fixed z-[55] w-[360px] max-w-[92vw] flex flex-col"
      style={{
        left: pos.x, top: pos.y, maxHeight: "70vh",
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
        {messages.map((m, i) => (<Message key={i} role={m.role} text={m.text} />))}
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
  );
}

function Message({ role, text }) {
  return (
    <div className={`text-[12px] leading-snug rounded-md p-2.5 ${role === "axe"
      ? "bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.18)] text-[#EAF2F7]"
      : "bg-white/4 border border-white/8 text-[#EAF2F7]"}`}>
      <div className="text-[9px] tracking-[0.10em] uppercase mb-1"
           style={{ color: role === "axe" ? "#66E6FF" : "#9FB0C0" }}>
        {role === "axe" ? "AXE" : "OPERATOR"}
      </div>
      <div className="whitespace-pre-wrap">{text}</div>
    </div>
  );
}
