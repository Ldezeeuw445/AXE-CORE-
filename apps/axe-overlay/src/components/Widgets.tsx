/** Notch v2 Widgets tab: 4 equal compact cards. Tasks = real AXE tasks
 * (read-only). Focus timer + note are local tools. Events = honest empty state
 * (the notch has no calendar source yet). */
import { useEffect, useState } from "react";
import { FOCUS_DEFAULT, FOCUS_STEP, NOTE_KEY, clampFocus, formatClock, wordCount } from "../widgets";
import { agentLabel, agentOf, statusVerb, taskTitle } from "../compact";
import type { ApprovalItem, LiveTask } from "../status";

type Props = {
  live: LiveTask[];
  approvals: ApprovalItem[];
  doneToday: number;
  connected: boolean;
  onOpenShell: (route?: string) => void;
  onOpenAlerts: () => void;
  now: Date;
};

export function Widgets(p: Props) {
  return (
    <div className="c-body widgets">
      <TasksCard {...p} />
      <FocusCard />
      <NoteCard />
      <EventsCard now={p.now} />
    </div>
  );
}

function TasksCard(p: Props) {
  const rows = p.live.slice(0, 3);
  return (
    <div className="c-card w">
      <div className="c-card-title">Tasks <span className="muted">{p.live.length} open · {p.doneToday} done</span></div>
      {!p.connected ? (
        <p className="c-empty small">Not connected: no API key.</p>
      ) : rows.length === 0 ? (
        <p className="c-empty small">No open tasks.</p>
      ) : (
        <ul className="c-rows tight">
          {rows.map((t) => (
            <li key={t.id} title={`${agentLabel(agentOf(t))}: ${taskTitle(t)}`}>
              <i className={`c-dot ${t.status === "waiting_approval" ? "warn" : ""}`} />
              <span className="c-row-t">{taskTitle(t)}</span>
              <span className="c-row-s">{statusVerb(t.status)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="w-foot">
        {p.approvals.length > 0 ? (
          <button type="button" className="c-link" onClick={p.onOpenAlerts}>✓ {p.approvals.length} waiting on you</button>
        ) : <span className="muted">Nothing waiting</span>}
        <button type="button" className="c-link" onClick={() => p.onOpenShell()}>Open HQ →</button>
      </div>
    </div>
  );
}

function FocusCard() {
  const [minutes, setMinutes] = useState(FOCUS_DEFAULT);
  const [left, setLeft] = useState<number | null>(null);
  const running = left !== null && left > 0;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const shown = left ?? minutes * 60;
  return (
    <div className="c-card w focus">
      <div className="c-card-title">Focus timer <span className="muted">{left === 0 ? "done" : running ? "running" : "ready"}</span></div>
      <div className="focus-clock">{formatClock(shown)}</div>
      <div className="focus-row">
        <button type="button" className="c-mini" disabled={running} onClick={() => setMinutes((m) => clampFocus(m - FOCUS_STEP))} aria-label="Less time">−</button>
        <button type="button" className={`c-mini wide ${running ? "on" : ""}`} onClick={() => setLeft(running ? null : minutes * 60)}>{running ? "Stop" : "Start"}</button>
        <button type="button" className="c-mini" disabled={running} onClick={() => setMinutes((m) => clampFocus(m + FOCUS_STEP))} aria-label="More time">+</button>
      </div>
    </div>
  );
}

function NoteCard() {
  const [text, setText] = useState(() => {
    try {
      return window.localStorage.getItem(NOTE_KEY) || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(NOTE_KEY, text);
    } catch { /* no storage */ }
  }, [text]);
  return (
    <div className="c-card w note">
      <div className="c-card-title">Note <span className="muted">{wordCount(text)} words · this Mac</span></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Jot something down…" aria-label="Note" />
    </div>
  );
}

function EventsCard({ now }: { now: Date }) {
  return (
    <div className="c-card w events">
      <div className="c-card-title">Today <span className="muted">{now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span></div>
      <div className="events-empty">
        <span className="ev-ic" aria-hidden>◷</span>
        <span>No calendar connected to the notch yet.</span>
      </div>
    </div>
  );
}
