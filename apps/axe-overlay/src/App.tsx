import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
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
import { NOTCH_TABS, tabActie, tabBadge, type NotchTab } from "./tabs";
import "./App.css";

const COLLAPSED = { w: 168, h: 44 };
const EXPANDED = { w: 420, h: 560 };
/** Match CSS emerge/retract durations */
const EMERGE_MS = 520;
const RETRACT_MS = 420;

type ShellStateDto = {
  running: boolean;
  visible: boolean;
  showNotch: boolean;
};

type NotchPhase = "hidden" | "emerging" | "visible" | "retracting";

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
  const [notchPhase, setNotchPhase] = useState<NotchPhase>("hidden");
  const [shellRunning, setShellRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<NotchTab>("chat");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const dragDepth = useRef(0);
  const notchPhaseRef = useRef<NotchPhase>("hidden");
  const animTimer = useRef<number | null>(null);

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

  // Shell presence → notch emerge / retract ("AXE always on your side")
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const applyShow = async (show: boolean) => {
      if (cancelled) return;
      if (animTimer.current) {
        window.clearTimeout(animTimer.current);
        animTimer.current = null;
      }
      const win = getCurrentWindow();
      const phase = notchPhaseRef.current;

      if (show) {
        if (phase === "visible" || phase === "emerging") return;
        try {
          await win.show();
          await win.setAlwaysOnTop(true);
        } catch { /* preview */ }
        notchPhaseRef.current = "emerging";
        setNotchPhase("emerging");
        animTimer.current = window.setTimeout(() => {
          notchPhaseRef.current = "visible";
          setNotchPhase("visible");
          animTimer.current = null;
        }, EMERGE_MS);
      } else {
        if (phase === "hidden" || phase === "retracting") return;
        // Collapse chat first so retract looks clean
        setExpanded(false);
        try {
          await win.setSize(new LogicalSize(COLLAPSED.w, COLLAPSED.h));
        } catch { /* preview */ }
        notchPhaseRef.current = "retracting";
        setNotchPhase("retracting");
        animTimer.current = window.setTimeout(async () => {
          notchPhaseRef.current = "hidden";
          setNotchPhase("hidden");
          try {
            await win.hide();
          } catch { /* preview */ }
          animTimer.current = null;
        }, RETRACT_MS);
      }
    };

    const onState = (s: ShellStateDto) => {
      setShellRunning(s.running);
      void applyShow(s.showNotch);
    };

    (async () => {
      try {
        const initial = await invoke<ShellStateDto>("get_shell_state");
        if (!cancelled) onState(initial);
      } catch {
        // Browser preview / missing command → keep notch visible
        if (!cancelled) void applyShow(true);
      }
      try {
        unlisten = await listen<ShellStateDto>("shell-state", (ev) => onState(ev.payload));
      } catch {
        /* non-tauri */
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      if (animTimer.current) window.clearTimeout(animTimer.current);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, expanded]);

  // Hammerspoon / ~/.axe/overlay.cmd → expand, PTT, briefs, approvals, managers
  useEffect(() => {
    let un: (() => void) | undefined;
    void (async () => {
      un = await listen<string>("overlay-cmd", (ev) => {
        const cmd = (ev.payload || "").trim();
        if (!cmd) return;
        if (cmd === "expand" || cmd.startsWith("ask:")) {
          setExpanded(true);
          void resize(true);
          if (cmd.startsWith("ask:")) {
            const q = cmd.slice(4).trim();
            if (q) setInput(q);
          }
          return;
        }
        if (cmd === "ptt-start") {
          setExpanded(true);
          void resize(true);
          setListening(true);
          return;
        }
        if (cmd === "ptt-stop") {
          setListening(false);
          return;
        }
        if (cmd === "approvals" || cmd === "approve-top" || cmd === "northsea-brief" || cmd === "daily-brief" || cmd === "focus-on" || cmd === "focus-off" || cmd.startsWith("manager-")) {
          setExpanded(true);
          void resize(true);
          if (cmd === "daily-brief") setInput("Geef een korte daily brief: approvals, NorthSea, app status.");
          if (cmd === "northsea-brief") setInput("Geef een kort NorthSea brief: deal-replies en next actions.");
        }
      });
    })();
    return () => un?.();
  }, [resize]);


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

  const openShell = async (route?: string) => {
    try {
      await invoke("activate_axe_shell", { route: route ?? null });
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Shell openen mislukt: ${(e as Error).message}`, at: Date.now() },
      ]);
    }
  };

  /** Collapsed pill: open shell. Expanded: toggle chat. Double-click always opens shell. */
  const onPillClick = () => {
    if (expanded) {
      void toggle();
      return;
    }
    void openShell();
  };

  return (
    <div
      className={`overlay-root ${expanded ? "expanded" : "collapsed"} ${dragging ? "dragging" : ""} state-${mascotState} phase-${notchPhase}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="notch-pill"
        onClick={onPillClick}
        onDoubleClick={() => void openShell()}
        onContextMenu={(e) => {
          e.preventDefault();
          void toggle();
        }}
        aria-label={expanded ? "AXE inklappen" : shellRunning ? "Open AXE CORE shell" : "AXE CORE starten"}
        title={expanded ? "Inklappen" : "Klik → shell · rechtsklik → chat"}
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

          <nav className="tab-rail" aria-label="AXE tabs">
            {NOTCH_TABS.map((t) => {
              const n = tabBadge(t.id, { approvals: approvals.length, tasks: tasks.length });
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tab ${activeTab === t.id ? "on" : ""}`}
                  onClick={() => {
                    const a = tabActie(t.id);
                    if (a.soort === "open-shell") void openShell(a.route);
                    else setActiveTab(a.tab);
                  }}
                  title={t.label}
                >
                  <span className="tab-ic">{t.icon}</span>
                  <span className="tab-lb">{t.label}</span>
                  {n > 0 && <span className="tab-badge">{n}</span>}
                </button>
              );
            })}
          </nav>

          {activeTab === "meldingen" && (
            <div className="tab-body">
              {approvals.length === 0 ? (
                <p className="empty">Geen openstaande goedkeuringen.</p>
              ) : (
                approvals.map((a) => (
                  <div key={a.id} className="live-chip appr">
                    <span className="dot warn" />
                    <span className="chip-title">{a.title || a.kind || a.id}</span>
                    <span className="chip-st">approval</span>
                  </div>
                ))
              )}
              <button type="button" className="ghost" onClick={() => void openShell()}>Goedkeuren in de shell</button>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="tab-body">
              {tasks.length === 0 ? (
                <p className="empty">Geen live taken.</p>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} className="live-chip">
                    <span className="dot" />
                    <span className="chip-title">{t.title || t.goal || t.capability || t.id}</span>
                    <span className="chip-st">{t.status}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "chat" && (<>
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
                AXE always on your side — notch alleen als de shell geminimaliseerd is. Vraag iets, sleep bestanden, of PTT. Rechtsklik op de notch voor chat.
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
          </>)}
        </section>
      )}
    </div>
  );
}
