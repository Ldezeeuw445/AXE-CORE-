import React, { useEffect, useRef, useState } from "react";
import { TriangleLogo } from "./TriangleLogo";
import { Spinner } from "./Spinner";
import { Minimize2, Send, GripVertical, X } from "lucide-react";
import { ai, vision } from "../../lib/api";
import { ScreenCaptureButton, VisionCapture } from "./VisionCapture";
import { FileUploadZone } from "./FileUploadZone";
import { ActionToolbar } from "./ActionToolbar";

const STORAGE_KEY = "axe_chat_pos";
const SESSION_KEY = "axe_chat_session";

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
  const [messages, setMessages] = useState([
    { role: "axe", text: "AXE Intelligence online. I see eight live layers. Ask me to correlate, summarize, or interrogate any signal on the board.\n\nUse /claw for web tasks, /code for coding, /work for documents.\n\nNew: Screen capture, webcam, file analysis, and action toolbar available." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));
  const [showVision, setShowVision] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [visionType, setVisionType] = useState("webcam"); // 'webcam' or 'screen'
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {} }, [pos]);
  useEffect(() => { if (sessionId) localStorage.setItem(SESSION_KEY, sessionId); }, [sessionId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy, open]);

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

  const addMessage = (role, text) => {
    setMessages((m) => [...m, { role, text }]);
  };

  const onSend = async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    addMessage("operator", msg);
    setBusy(true);
    if (isMobile && (!open || minimized)) { setOpen(true); setMinimized(false); }

    try {
      const res = await ai.chat(msg, sessionId);
      if (res?.session_id) setSessionId(res.session_id);
      addMessage("axe", res?.response || "[no response]");
    } catch (e) {
      addMessage("axe", `[error: ${e?.message || "request failed"}]`);
    } finally { setBusy(false); }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleScreenCapture = async (dataUrl) => {
    addMessage("operator", "[Screen capture shared]");
    setBusy(true);
    try {
      const res = await vision.screenshot(dataUrl, "Operator shared a screenshot", sessionId);
      if (res?.status === "ok") {
        addMessage("axe", `🖥 Screen Analysis:\n${res.analysis}`);
      } else {
        addMessage("axe", `[Vision error: ${res?.error || "unknown"}]`);
      }
    } catch (e) {
      addMessage("axe", `[Vision error: ${e?.message || "request failed"}]`);
    } finally {
      setBusy(false);
    }
  };

  const handleWebcamCapture = async (dataUrl) => {
    addMessage("operator", "[Webcam frame shared]");
    setBusy(true);
    try {
      const res = await vision.webcam(dataUrl, "Operator shared a webcam frame", sessionId);
      if (res?.status === "ok") {
        addMessage("axe", `📷 Webcam Analysis:\n${res.analysis}`);
      } else {
        addMessage("axe", `[Vision error: ${res?.error || "unknown"}]`);
      }
    } catch (e) {
      addMessage("axe", `[Vision error: ${e?.message || "request failed"}]`);
    } finally {
      setBusy(false);
    }
  };

  const handleFileAnalysis = (result) => {
    if (result?.status === "ok") {
      addMessage("operator", `[File analyzed: ${result.filename || "uploaded file"}]`);
      addMessage("axe", `📄 File Analysis (${result.filename}):\n${result.analysis || "[No analysis]"}`);
    } else {
      addMessage("axe", `[File analysis error: ${result?.error || "unknown"}]`);
    }
  };

  const handleQuickAction = async (actionId) => {
    if (actionId === "browser_open_tab") {
      const url = window.prompt("Enter URL to open in browser:");
      if (url) {
        window.dispatchEvent(new CustomEvent("axe-open-browser", { detail: { url } }));
      }
      return;
    }
    if (actionId === "browser_close_tab") {
      // No direct close event, but BrowserPanel handles its own close
      return;
    }
    if (actionId === "correlate_sources") {
      addMessage("operator", "/correlate");
      setBusy(true);
      try {
        const res = await ai.correlate();
        addMessage("axe", `🔗 Correlation Result:\n${JSON.stringify(res?.result?.headline_risk || "N/A", null, 2)}`);
      } catch (e) {
        addMessage("axe", `[Correlation error: ${e?.message}]`);
      } finally { setBusy(false); }
      return;
    }
    if (actionId === "sweep_sources") {
      addMessage("operator", "/sweep");
      setBusy(true);
      try {
        const res = await ai.correlate(); // Sweep triggers via sources
        addMessage("axe", "🌐 Sweep initiated. Check the terminal for updates.");
      } catch (e) {
        addMessage("axe", `[Sweep error: ${e?.message}]`);
      } finally { setBusy(false); }
      return;
    }
    // Default: send as a message to AXE
    setInput(`/action ${actionId}`);
    inputRef.current?.focus();
  };

  const openFull = () => { setOpen(true); setMinimized(false); };
  const minimize = () => { setMinimized(true); setOpen(false); };
  const close = () => { setOpen(false); setMinimized(true); };

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

  return (
    <>
      <div className="fixed z-[55]" style={{ left: pos.x, top: pos.y }}>
        <div data-testid="axe-chat-widget" className="w-[400px] max-w-[92vw] flex flex-col"
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
            <button onClick={minimize} data-testid="axe-chat-minimize-button"
              className="text-[#6F8193] hover:text-[#66E6FF] p-1" aria-label="Minimize">
              <Minimize2 size={14} />
            </button>
            <button onClick={close} className="text-[#6F8193] hover:text-[#FF4D6D] p-1" aria-label="Close">
              <X size={14} />
            </button>
          </div>

          <ActionToolbar
            onScreenCapture={() => {
              setVisionType("screen");
              setShowVision(true);
            }}
            onWebcamToggle={() => {
              setVisionType("webcam");
              setShowVision(true);
            }}
            onFileUpload={() => setShowFileUpload(true)}
            onQuickAction={handleQuickAction}
            disabled={busy}
          />

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px]"
            data-testid="axe-chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`text-[12px] leading-snug rounded-md p-2.5 ${m.role === "axe"
                ? "bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.18)] text-[#EAF2F7]"
                : "bg-white/4 border border-white/8 text-[#EAF2F7]"}`}>
                <div className="text-[9px] tracking-[0.10em] uppercase mb-1"
                  style={{ color: m.role === "axe" ? "#66E6FF" : "#9FB0C0" }}
                >
                  {m.role === "axe" ? "AXE" : "OPERATOR"}
                </div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}
            {busy && (
              <div className="text-[11px] text-[#9FB0C0] inline-flex items-center gap-2">
                <Spinner variant="braille" label="AXE reasoning" />
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-white/8 flex items-center gap-2">
            <input ref={inputRef}
              data-testid="axe-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask AXE anything..."
              className="axe-input flex-1"
            />
            <button onClick={onSend} disabled={busy}
              data-testid="axe-chat-send-button"
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-[#00D4FF] text-black text-[11px] font-semibold tracking-[0.06em] uppercase hover:bg-[#66E6FF] transition-colors disabled:opacity-60"
            >
              {busy ? <Spinner variant="dots" colorClassName="text-black" /> : <Send size={12} />} SEND
            </button>
          </div>
        </div>
      </div>

      {showVision && visionType === "screen" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowVision(false); }}
        >
          <div className="flex flex-col gap-3 p-4"
            style={{
              width: "min(90vw, 400px)",
              background: "#0B0C0E",
              border: "1px solid rgba(0,212,255,0.25)",
              borderRadius: 16,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">SCREEN CAPTURE</span>
              </div>
              <button onClick={() => setShowVision(false)} className="text-[#6F8193] hover:text-[#FF4D6D] p-1">
                <X size={14} />
              </button>
            </div>
            <p className="text-[10px] text-[#9FB0C0]">
              Choose your screen/window to capture, then share with AXE for analysis.
            </p>
            <ScreenCaptureButton
              disabled={busy}
              onCapture={(dataUrl) => {
                setShowVision(false);
                handleScreenCapture(dataUrl);
              }}
              onError={(err) => {
                addMessage("axe", `[Screen capture error: ${err}]`);
              }}
            />
          </div>
        </div>
      )}

      {showVision && visionType === "webcam" && (
        <VisionCapture
          onCapture={(dataUrl) => {
            setShowVision(false);
            handleWebcamCapture(dataUrl);
          }}
          onError={(err) => {
            addMessage("axe", `[Webcam error: ${err}]`);
          }}
          onClose={() => setShowVision(false)}
        />
      )}

      {showFileUpload && (
        <FileUploadZone
          disabled={busy}
          onUpload={(result) => {
            setShowFileUpload(false);
            handleFileAnalysis(result);
          }}
          onError={(err) => {
            addMessage("axe", `[File upload error: ${err}]`);
          }}
          onClose={() => setShowFileUpload(false)}
        />
      )}
    </>
  );
}
