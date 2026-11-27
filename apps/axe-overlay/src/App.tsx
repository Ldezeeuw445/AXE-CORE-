import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  fetchTaskBoard,
  fetchTaskSteps,
  retryTask,
  type ApprovalItem,
  type LiveTask,
  type TaskStep,
} from "./status";
import { CompactNotch, type CompactTab } from "./components/CompactNotch";
import { compactState } from "./compact";
import { loadSize, saveSize, sizeFromCmd, sizeKeyAction, toggleSize, type NotchSize } from "./notchSize";
import { designData, designState } from "./design";
import { NOTCH_TABS, tabActie, tabBadge, type NotchTab } from "./tabs";
import {
  TOPBAR_BUTTONS,
  TOPBAR_HEIGHT,
  topbarActie,
  topbarBadge,
  type TopbarId,
} from "./topbar";
import "./App.css";

/** Match CSS emerge/retract durations; collapsed H = TOPBAR_HEIGHT (Rust COLLAPSED_H). */
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

function browserStore(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const DESIGN = designState({
  dev: import.meta.env.DEV,
  tauri: typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  search: typeof window !== "undefined" ? window.location.search : "",
});

export default function App() {
  const [expanded, setExpanded] = useState(DESIGN !== null);
  /** Remembered open size (default compact). */
  const [pref, setPref] = useState<NotchSize>(() => (DESIGN === "large" ? "large" : loadSize(browserStore())));
  /** Size actually shown while open (chat may open large without changing pref). */
  const [view, setView] = useState<NotchSize>(() => (DESIGN === "large" ? "large" : loadSize(browserStore())));
  const [compactTab, setCompactTab] = useState<CompactTab>(DESIGN === "widgets" ? "widgets" : "live");
  const [connected, setConnected] = useState(true);
  const [failed, setFailed] = useState<LiveTask[]>([]);
  const [doneToday, setDoneToday] = useState(0);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => new Date());
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [pollNonce, setPollNonce] = useState(0);
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
    : failed.length > 0
      ? "error"
    : flashDone
      ? "done"
      : busy
        ? "thinking"
        : activity.computer + activity.browser > 0
          ? "working"
          : "idle";

  /** Rust pin_overlay_frame: centred, flush under the menu bar; `size` picks compact vs large. */
  const resize = useCallback(async (open: boolean, size?: NotchSize) => {
    try {
      await invoke("resize_overlay", { expanded: open, size: size ?? null });
    } catch {
      /* browser preview */
    }
  }, []);

  /** Open the notch at a size. `remember` = Luka chose this size explicitly. */
  const openAt = useCallback(
    (size: NotchSize, remember = false) => {
      if (remember) {
        setPref(size);
        saveSize(browserStore(), size);
      }
      if (!expanded) setOpenedAt(Date.now());
      setView(size);
      setExpanded(true);
      void resize(true, size);
      if (size === "large") setTimeout(() => inputRef.current?.focus(), 80);
    },
    [expanded, resize],
  );

  const close = useCallback(() => {
    setExpanded(false);
    void resize(false);
  }, [resize]);

  /** Right-click / pill: open at the remembered size (compact by default), or close. */
  const toggle = useCallback(async () => {
    if (expanded) close();
    else openAt(pref);
  }, [expanded, close, openAt, pref]);

  // Always-on live status poll (design mode: fixed layout data, no network)
  useEffect(() => {
    if (DESIGN) {
      const d = designData(DESIGN);
      setOnline(d.online);
      setTasks(d.live);
      setFailed(d.failed);
      setDoneToday(d.doneToday);
      setApprovals(d.approvals);
      setSteps(d.steps);
      if (DESIGN === "drop") {
        setDragging(true);
        setPendingFiles([
          { name: "freight-q4.pdf", size: 182_000, kind: "doc", note: "design sample" },
          { name: "rates.xlsx", size: 40_000, kind: "sheet", note: "design sample" },
        ]);
      }
      if (DESIGN === "idle") setOpenedAt(Date.now() - 60_000);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const [b, a] = await Promise.all([fetchTaskBoard(), fetchApprovals()]);
        if (cancelled) return;
        setConnected(b.connected);
        setTasks(b.live);
        setFailed(b.failed);
        setDoneToday(b.doneToday);
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
  }, [pollNonce]);

  // Steps of the focused live task, only while the compact strip is open.
  const focusId = tasks[0]?.id;
  useEffect(() => {
    if (DESIGN || !expanded || view !== "compact" || !focusId) {
      if (!DESIGN) setSteps([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const s = await fetchTaskSteps(focusId);
      if (!cancelled) setSteps(s);
    };
    void tick();
    const id = window.setInterval(tick, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [expanded, view, focusId]);

  // Clock + greeting → idle hand-off.
  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [expanded]);

  // Keyboard inside the notch: ⌘E toggles compact ↔ large (remembered), Esc steps down.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      const a = sizeKeyAction(e);
      if (!a) return;
      if (a === "toggle") {
        e.preventDefault();
        openAt(toggleSize(view), true);
      } else if (a === "step-down") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT") && (t as HTMLTextAreaElement).value) return;
        e.preventDefault();
        if (view === "large") openAt("compact", true);
        else close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, view, openAt, close]);

  const onRetry = async () => {
    setRetryMsg(null);
    if (!online || failed.length === 0) {
      setPollNonce((n) => n + 1);
      setRetryMsg("Checking again…");
      window.setTimeout(() => setRetryMsg(null), 2500);
      return;
    }
    if (DESIGN) {
      setRetryMsg("Design mode: nothing sent.");
      return;
    }
    setRetryBusy(true);
    const r = await retryTask(failed[0]);
    setRetryBusy(false);
    setRetryMsg(r.message);
    if (r.ok) setPollNonce((n) => n + 1);
  };

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
      let win: ReturnType<typeof getCurrentWindow> | null = null;
      try {
        win = getCurrentWindow();
      } catch {
        /* browser preview: no Tauri window */
      }
      const phase = notchPhaseRef.current;

      if (show) {
        if (phase === "visible" || phase === "emerging") return;
        try {
          await win?.show();
          await win?.setAlwaysOnTop(true);
          // Re-pin after show — otherwise frame drifts off top-center.
          await invoke("resize_overlay", { expanded: false });
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
          await invoke("resize_overlay", { expanded: false });
        } catch { /* preview */ }
        notchPhaseRef.current = "retracting";
        setNotchPhase("retracting");
        animTimer.current = window.setTimeout(async () => {
          notchPhaseRef.current = "hidden";
          setNotchPhase("hidden");
          try {
            await win?.hide();
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

  // Refs so the long-lived overlay-cmd listener always sees the latest size logic.
  const prefRef = useRef(pref);
  prefRef.current = pref;
  const openAtRef = useRef(openAt);
  openAtRef.current = openAt;

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
        if (cmd === "collapse") {
          setExpanded(false);
          void resize(false);
          return;
        }
        const sized = sizeFromCmd(cmd, prefRef.current);
        if (sized) {
          // expand-large / expand-compact / toggle-size are explicit choices → remember.
          openAtRef.current(sized, cmd !== "expand");
          return;
        }
        if (cmd.startsWith("ask:")) {
          setActiveTab("chat");
          openAtRef.current("large");
          const q = cmd.slice(4).trim();
          if (q) setInput(q);
          return;
        }
        if (cmd === "ptt-start") {
          setActiveTab("chat");
          openAtRef.current("large");
          setListening(true);
          return;
        }
        if (cmd === "ptt-stop") {
          setListening(false);
          return;
        }
        if (cmd === "daily-brief" || cmd === "northsea-brief") {
          setActiveTab("chat");
          openAtRef.current("large");
          if (cmd === "daily-brief") setInput("Give a short daily brief: approvals, NorthSea, app status.");
          if (cmd === "northsea-brief") setInput("Give a short NorthSea brief: deal replies and next actions.");
          return;
        }
        if (cmd === "approvals" || cmd === "approve-top" || cmd === "focus-on" || cmd === "focus-off" || cmd.startsWith("manager-")) {
          // Status-type commands: the remembered size (compact shows waiting + agents).
          if (cmd === "approvals" || cmd === "approve-top") setActiveTab("meldingen");
          setCompactTab("live");
          openAtRef.current(prefRef.current);
        }
      });
    })();
    return () => un?.();
  }, [resize]);


  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if ((!text && pendingFiles.length === 0) || busy) return;
    const payload = text || "(files received, see context)";
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
        { role: "assistant", content: `Error: ${(e as Error).message}`, at: Date.now() },
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
        note: `Dropped on AXE notch — ready as computer/browser use context (${Math.round(f.size / 1024)} KB)`,
      });
    }
    setPendingFiles((p) => [...p, ...next].slice(0, 12));
    // Drop opens the compact strip (files wait as chips); the large chat only when asked.
    if (!expanded) openAt(pref);
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
          content: "Speech recognition is not available in this runtime.",
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
    if (!expanded || view !== "large") openAt("large");
  };

  const openShell = async (route?: string) => {
    try {
      await invoke("activate_axe_shell", { route: route ?? null });
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Could not open the shell: ${(e as Error).message}`, at: Date.now() },
      ]);
    }
  };

  /** Expanded header: toggle chat. Double-click always opens shell. */
  const onPillClick = () => {
    if (expanded) {
      void toggle();
      return;
    }
    void openShell();
  };

  const onTopbar = (id: TopbarId) => {
    const a = topbarActie(id);
    switch (a.soort) {
      case "open-hq":
        void openShell();
        return;
      case "new-chat":
        setActiveTab("chat");
        setMessages([]);
        setInput("");
        openAt("large");
        return;
      case "ptt":
        setActiveTab("chat");
        togglePtt();
        return;
      case "approvals":
        setActiveTab("meldingen");
        setCompactTab("live");
        openAt(pref);
        return;
      case "agents":
        setActiveTab("agents");
        setCompactTab("live");
        openAt(pref);
        return;
      case "settings":
        void openShell("settings");
        return;
    }
  };

  const showTopbar = notchPhase !== "hidden" && !expanded;
  const cState = compactState({
    online,
    dragging: dragging || (DESIGN === "drop"),
    hasFiles: pendingFiles.length > 0,
    live: tasks,
    failed,
    openForMs: DESIGN === "greeting" ? 0 : now.getTime() - openedAt,
  });
  const showCompact = expanded && view === "compact";
  const openChatLarge = () => {
    setActiveTab("chat");
    openAt("large");
  };
  const openAlertsLarge = () => {
    setActiveTab("meldingen");
    openAt("large");
  };

  return (
    <div
      className={`overlay-root ${expanded ? `expanded size-${view}` : "collapsed"} ${dragging ? "dragging" : ""} state-${mascotState} phase-${notchPhase}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {showTopbar ? (
        <div
          className="topbar"
          role="toolbar"
          aria-label="AXE Core topbar"
          style={{ height: TOPBAR_HEIGHT }}
        >
          <button
            type="button"
            className="topbar-mascot"
            onClick={() => void openShell()}
            onDoubleClick={() => void openShell()}
            onContextMenu={(e) => {
              e.preventDefault();
              void toggle();
            }}
            aria-label={shellRunning ? "Open AXE CORE HQ" : "Start AXE Core"}
            title="Click → HQ · right-click → chat"
          >
            <AxeMascot state={mascotState} size={30} />
            <span className={`pulse-ring ${mascotState}`} />
          </button>
          <div className="topbar-actions">
            {TOPBAR_BUTTONS.map((b) => {
              const n = topbarBadge(b.id, {
                approvals: approvals.length,
                tasks: tasks.length,
              });
              const pttOn = b.id === "ptt" && listening;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`topbar-btn ${pttOn ? "ptt-on" : ""}`}
                  title={b.title}
                  onClick={() => onTopbar(b.id)}
                >
                  <span className="tb-ic">{b.icon}</span>
                  <span className="tb-lb">{b.label}</span>
                  {n > 0 && <span className="tb-badge">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : showCompact ? (
        <CompactNotch
          state={cState}
          tab={compactTab}
          onTab={setCompactTab}
          online={online}
          connected={connected}
          live={tasks}
          failed={failed}
          doneToday={doneToday}
          approvals={approvals}
          steps={steps}
          mascotState={mascotState}
          pendingFiles={pendingFiles}
          onRemoveFile={(i) => setPendingFiles((p) => p.filter((_, j) => j !== i))}
          onAskFiles={openChatLarge}
          onExpand={() => openAt("large", true)}
          onClose={close}
          onOpenChat={openChatLarge}
          onOpenAlerts={openAlertsLarge}
          onOpenShell={(r) => void openShell(r)}
          onRetry={() => void onRetry()}
          retryBusy={retryBusy}
          retryMsg={retryMsg}
          now={now}
        />
      ) : (
        <button
          type="button"
          className="notch-pill"
          onClick={onPillClick}
          onDoubleClick={() => void openShell()}
          onContextMenu={(e) => {
            e.preventDefault();
            void toggle();
          }}
          aria-label={expanded ? "Collapse AXE" : shellRunning ? "Open AXE CORE shell" : "Start AXE Core"}
          title={expanded ? "Collapse" : "Click → shell · right-click → chat"}
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
      )}

      {expanded && view === "large" && (
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
              <button type="button" className="ghost" onClick={() => void openShell()} title="Open AXE Core HQ">
                Open HQ
              </button>
              <button type="button" className="ghost" onClick={() => openAt("compact", true)} title="Compact (⌘E)" aria-label="Back to the compact strip">
                ⤡ Compact
              </button>
              <button type="button" className="ghost" onClick={close} aria-label="Close" title="Close">
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
                <p className="empty">No open approvals.</p>
              ) : (
                approvals.map((a) => (
                  <div key={a.id} className="live-chip appr">
                    <span className="dot warn" />
                    <span className="chip-title">{a.title || a.kind || a.id}</span>
                    <span className="chip-st">approval</span>
                  </div>
                ))
              )}
              <button type="button" className="ghost" onClick={() => void openShell()}>Approve in the shell</button>
            </div>
          )}

          {activeTab === "agents" && (
            <div className="tab-body">
              {tasks.length === 0 ? (
                <p className="empty">No live tasks.</p>
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
                AXE always on your side — the notch only shows when the shell is minimised. Ask something, drop files, or use PTT. Right-click the notch for chat.
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
                <span>working…</span>
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
                    aria-label="Remove"
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
              placeholder="Message AXE…"
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
                {listening ? "● Listening" : "🎙 PTT"}
              </button>
              <label className="file-btn" title="Files">
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
                Send
              </button>
            </div>
          </div>
          </>)}
        </section>
      )}
    </div>
  );
}
