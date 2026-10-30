import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { AxeMascot, type MascotState } from "./components/AxeMascot";
import {
  sendOverlayChat,
  type ChatMessage,
  type FileContext,
} from "./chat";
import {
  classifyActivity,
  fetchApprovals,
  fetchLiveTasks,
  type ApprovalItem,
  type LiveTask,
} from "./status";
import "./App.css";

const COLLAPSED = { w: 168, h: 44 };
const EXPANDED = { w: 420, h: 560 };

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRec;
    SpeechRecognition?: new () => SpeechRec;
  }
}

function fileKind(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return "doc";
  if (["csv", "xlsx", "xls"].includes(ext)) return "sheet";
  return "file";
}

export default function App() {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingFiles, setPendingFiles] = useState<FileContext[]>([]);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [flashDone, setFlashDone] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const dragDepth = useRef(0);

  const activity = classifyActivity(tasks);
  const mascotState: MascotState = !online
    ? "offline"
    : flashDone
      ? "done"
      : busy
        ? "thinking"
        : activity.computer + activity.browser > 0
          ? "working"
          : "idle";

  const resize = useCallback(async (open: boolean) => {
    try {
      const win = getCurrentWindow();
      const s = open ? EXPANDED : COLLAPSED;
      await win.setSize(new LogicalSize(s.w, s.h));
    } catch {
      /* browser preview */
    }
  }, []);

  const toggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    await resize(next);
    if (next) setTimeout(() => inputRef.current?.focus(), 80);
  }, [expanded, resize]);

  // Always-on live status poll
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [t, a] = await Promise.all([fetchLiveTasks(), fetchApprovals()]);
        if (cancelled) return;
        setTasks(t);
        setApprovals(a);
        setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, expanded]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if ((!text && pendingFiles.length === 0) || busy) return;
    const payload = text || "(bestanden ontvangen — zie context)";
    const files = [...pendingFiles];
    setInput("");
    setPendingFiles([]);
    setMessages((m) => [...m, { role: "user", content: payload, at: Date.now() }]);
    setBusy(true);
    try {
      const reply = await sendOverlayChat(payload, messages, files);
      setMessages((m) => [...m, { role: "assistant", content: reply, at: Date.now() }]);
      setFlashDone(true);
      window.setTimeout(() => setFlashDone(false), 1400);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Fout: ${(e as Error).message}`, at: Date.now() },
      ]);
      setOnline(false);
    } finally {
      setBusy(false);
    }
  };

  const onDropFiles = (fileList: FileList | File[]) => {
    const next: FileContext[] = [];
    for (const f of Array.from(fileList).slice(0, 8)) {
      next.push({
        name: f.name,
        size: f.size,
        kind: fileKind(f.name),
        note: `Dropped on AXE notch — klaar voor computer/browser use context (${Math.round(f.size / 1024)} KB)`,
      });
    }
    setPendingFiles((p) => [...p, ...next].slice(0, 12));
    if (!expanded) void toggle();
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
  };

  const togglePtt = () => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Spraakherkenning niet beschikbaar in deze runtime.",
          at: Date.now(),
        },
      ]);
      return;
    }
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "nl-NL";
    rec.onresult = (ev) => {
      let final = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else setInput(r[0].transcript);
      }
      if (final.trim()) {
        setInput(final.trim());
        void send(final.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
    if (!expanded) void toggle();
  };

  const openShell = async () => {
    try {
      // Prefer local AXE HQ shell URL; fall back to public HQ.
      await shellOpen("https://hq.axe.core/");
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Shell openen mislukt: ${(e as Error).message}`, at: Date.now() },
      ]);
    }
  };

  return (
    <div
      className={`overlay-root ${expanded ? "expanded" : "collapsed"} ${dragging ? "dragging" : ""} state-${mascotState}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="notch-pill"
        onClick={() => void toggle()}
        aria-label={expanded ? "AXE inklappen" : "AXE uitklappen"}
      >
        <AxeMascot state={mascotState} size={expanded ? 40 : 32} />
        <span className="pill-meta">
          <span className="pill-brand">AXE</span>
          {(activity.computer > 0 || activity.browser > 0) && (
            <span className="pill-live">
              {activity.computer > 0 && <em className="tag-comp">💻{activity.computer}</em>}
              {activity.browser > 0 && <em className="tag-br">🌐{activity.browser}</em>}
            </span>
          )}
          {approvals.length > 0 && <span className="pill-appr">{approvals.length}</span>}
        </span>
        <span className={`pulse-ring ${mascotState}`} />
      </button>

      {expanded && (
        <section className="panel" role="dialog" aria-label="AXE Core notch">
          <header className="panel-head">
            <div className="head-left">
              <AxeMascot state={mascotState} size={28} showBubble={false} />
              <div>
                <strong>AXE Core</strong>
                <span className="sub">
                  {online ? "live · computer & browser always-on" : "offline · check API key"}
                </span>
              </div>
            </div>
            <div className="head-actions">
              <button type="button" className="ghost" onClick={() => void openShell()} title="Open Tauri / HQ shell">
                Open shell
              </button>
              <button type="button" className="ghost" onClick={() => void toggle()} aria-label="Sluiten">
                ✕
              </button>
            </div>
          </header>

          {(activity.computer + activity.browser + activity.other > 0 || approvals.length > 0) && (
            <div className="live-strip">
              {tasks.slice(0, 4).map((t) => (
                <div key={t.id} className="live-chip">
                  <span className="dot" />
                  <span className="chip-title">{t.title || t.goal || t.capability || t.id}</span>
                  <span className="chip-st">{t.status}</span>
                </div>
              ))}
              {approvals.slice(0, 3).map((a) => (
                <div key={a.id} className="live-chip appr">
                  <span className="dot warn" />
                  <span className="chip-title">{a.title || a.kind || a.id}</span>
                  <span className="chip-st">approval</span>
                </div>
              ))}
            </div>
          )}

          <div className="messages" ref={listRef}>
            {messages.length === 0 && (
              <p className="empty">
                Vraag iets, sleep bestanden hierheen, of houd PTT in voor spraak. Computer use en browser use
                lopen always-on via de orchestrator.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="msg assistant thinking">
                <AxeMascot state="thinking" size={22} />
                <span>bezig…</span>
              </div>
            )}
          </div>

          {pendingFiles.length > 0 && (
            <ul className="file-strip">
              {pendingFiles.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span className="fk">{f.kind}</span>
                  <span className="fn">{f.name}</span>
                  <button
                    type="button"
                    aria-label="Verwijder"
                    onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={`composer ${dragging ? "drop-active" : ""}`}>
            {dragging && <div className="drop-hint">Drop → AXE</div>}
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              placeholder="Bericht aan AXE…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-bar">
              <button
                type="button"
                className={`ptt ${listening ? "on" : ""}`}
                onClick={togglePtt}
                title="Push-to-talk"
              >
                {listening ? "● Luisteren" : "🎙 PTT"}
              </button>
              <label className="file-btn" title="Bestanden">
                📎
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) onDropFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="send"
                disabled={busy || (!input.trim() && pendingFiles.length === 0)}
                onClick={() => void send()}
              >
                Stuur
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
