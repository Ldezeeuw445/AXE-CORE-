/**
 * Notch v2 compact strip (~216px): the default unfold. Matte-black AXE cards,
 * real data only. States: greeting, idle, working, error, drop + Widgets tab.
 * Buttons only open views, re-poll, or call the existing safe task retry.
 * Nothing here approves, trades, pays, deploys or sends.
 */
import { AxeMascot, type MascotState } from "./AxeMascot";
import { Widgets } from "./Widgets";
import {
  agentPills,
  errorReason,
  greeting,
  stepRows,
  taskTitle,
  agentLabel,
  agentOf,
  waitingLine,
  type CompactState,
} from "../compact";
import { isRiskyTask, type ApprovalItem, type LiveTask, type TaskStep } from "../status";
import type { FileContext } from "../chat";

export type CompactTab = "live" | "widgets";

type Props = {
  state: CompactState;
  tab: CompactTab;
  onTab: (t: CompactTab) => void;
  online: boolean;
  connected: boolean;
  live: LiveTask[];
  failed: LiveTask[];
  doneToday: number;
  approvals: ApprovalItem[];
  steps: TaskStep[];
  mascotState: MascotState;
  pendingFiles: FileContext[];
  onRemoveFile: (i: number) => void;
  onAskFiles: () => void;
  onExpand: () => void;
  onClose: () => void;
  onOpenChat: () => void;
  onOpenAlerts: () => void;
  onOpenShell: (route?: string) => void;
  onRetry: () => void;
  retryBusy: boolean;
  retryMsg: string | null;
  now: Date;
};

function hhmm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function CompactNotch(p: Props) {
  const waiting = p.approvals.length;
  return (
    <section className={`compact compact-${p.tab === "widgets" ? "widgets" : p.state}`} role="dialog" aria-label="AXE Core notch">
      <header className="c-head">
        <nav className="c-tabs" aria-label="Notch views">
          <button type="button" className={`c-tab ${p.tab === "live" ? "on" : ""}`} onClick={() => p.onTab("live")} title="Live">
            <span aria-hidden>⌂</span><span className="c-tab-lb">Live</span>
          </button>
          <button type="button" className={`c-tab ${p.tab === "widgets" ? "on" : ""}`} onClick={() => p.onTab("widgets")} title="Widgets">
            <span aria-hidden>▦</span><span className="c-tab-lb">Widgets</span>
          </button>
          <button type="button" className="c-tab" onClick={p.onOpenChat} title="New chat (opens the large view)">
            <span aria-hidden>＋</span><span className="c-tab-lb">Chat</span>
          </button>
        </nav>
        <div className="c-status" aria-label="Status">
          <span className={`c-stat ${p.online ? (p.connected ? "ok" : "muted") : "bad"}`} title={p.connected ? "AXE Core API" : "No API key configured"}>
            <i className="c-dot" />{!p.online ? "Offline" : p.connected ? "Live" : "Not connected"}
          </span>
          <button type="button" className={`c-stat btn ${waiting ? "warn" : ""}`} onClick={p.onOpenAlerts} title="Waiting on you (review in the large view or AXE Core)">
            ✓ {waiting}
          </button>
          <span className="c-stat" title="Live tasks">◉ {p.live.length}</span>
          <span className="c-stat time" title={p.now.toDateString()}>{hhmm(p.now)}</span>
          <button type="button" className="c-icon-btn" onClick={p.onExpand} title="Expand (⌘E)" aria-label="Expand to the large view">⤢</button>
          <button type="button" className="c-icon-btn" onClick={p.onClose} title="Close (Esc)" aria-label="Close notch">✕</button>
        </div>
      </header>

      {p.tab === "widgets" ? (
        <Widgets live={p.live} approvals={p.approvals} doneToday={p.doneToday} connected={p.connected} onOpenShell={p.onOpenShell} onOpenAlerts={p.onOpenAlerts} now={p.now} />
      ) : (
        <div className="c-body">
          {p.state === "drop" && <DropZone {...p} />}
          {p.state === "error" && <ErrorCard {...p} />}
          {p.state === "greeting" && <GreetingCard {...p} />}
          {p.state === "idle" && <IdleCards {...p} />}
          {p.state === "working" && <WorkingCards {...p} />}
        </div>
      )}
    </section>
  );
}

function GreetingCard(p: Props) {
  const parts = [waitingLine(p.approvals)];
  if (p.doneToday > 0) parts.push(`${p.doneToday} done today`);
  if (!p.connected) parts.splice(0, parts.length, "Not connected: add ~/.axe/axe-api.key to see live data");
  return (
    <div className="c-card greet">
      <div className="particles" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${4 + i * 7}%`, animationDelay: `${(i % 5) * 0.4}s` }} />)}</div>
      <div className="greet-glow" aria-hidden />
      <AxeMascot state={p.mascotState} size={58} showBubble={false} badge={p.connected ? "live" : null} />
      <div className="greet-text">
        <strong>{greeting(p.now.getHours())}, Luka</strong>
        <span>{parts.join(" · ")}</span>
      </div>
    </div>
  );
}

function IdleCards(p: Props) {
  return (
    <>
      <div className="c-card who center">
        <AxeMascot state={p.mascotState} size={52} showBubble={false} badge={p.approvals.length ? "warn" : "live"} />
        <div className="who-text">
          <strong>{greeting(p.now.getHours())}</strong>
          <span>{p.connected ? "All quiet. No agent is working right now." : "Not connected: no API key on this Mac."}</span>
          <div className="kpis">
            <span><b>{p.approvals.length}</b> waiting</span>
            <span><b>{p.doneToday}</b> done today</span>
            <span><b>{p.live.length}</b> live</span>
          </div>
        </div>
      </div>
      <div className="c-card list">
        <div className="c-card-title">Waiting on you</div>
        {p.approvals.length === 0 ? (
          <p className="c-empty">Nothing waiting on you.</p>
        ) : (
          <ul className="c-rows">
            {p.approvals.slice(0, 3).map((a) => (
              <li key={a.id}><i className="c-dot warn" /><span className="c-row-t">{a.title || a.kind || a.id}</span></li>
            ))}
          </ul>
        )}
        {p.approvals.length > 0 && (
          <button type="button" className="c-link" onClick={p.onOpenAlerts}>Review {p.approvals.length > 3 ? `all ${p.approvals.length}` : ""} →</button>
        )}
      </div>
    </>
  );
}

function WorkingCards(p: Props) {
  const focus = p.live[0];
  const rows = stepRows(p.steps);
  const pills = agentPills(p.live);
  return (
    <>
      <div className="c-card who">
        <AxeMascot state={p.mascotState} size={52} badge={p.approvals.length ? "warn" : "live"} />
        <div className="who-text">
          <strong title={taskTitle(focus)}>{taskTitle(focus)}</strong>
          <span className="who-sub">{agentLabel(agentOf(focus))}</span>
          {rows.length === 0 ? (
            <p className="c-empty small">No steps reported yet.</p>
          ) : (
            <ol className="steps">
              {rows.map((r) => (
                <li key={r.id} className={r.mark}>
                  <span className="mk" aria-hidden>{r.mark === "current" ? ">" : r.mark === "done" ? "✓" : r.mark === "failed" ? "!" : "·"}</span>
                  <span className="st">{r.title}{r.mark === "current" ? "…" : ""}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <div className="c-card agents">
        <div className="c-card-title">
          Agents <span className="muted">{p.live.length} live</span>
          {p.approvals.length > 0 && <button type="button" className="c-link right" onClick={p.onOpenAlerts}>{waitingLine(p.approvals)} →</button>}
        </div>
        <div className="pills">
          {pills.map((x) => (
            <div key={x.id} className={`pill c-${x.color}`} title={`${x.agent}: ${x.text} (${x.status})`}>
              <span className="pill-av" aria-hidden>{x.agent.slice(0, 1)}</span>
              <span className="pill-tx"><b>{x.agent}</b><span>{x.text}</span></span>
              <span className="pill-st">{x.status}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ErrorCard(p: Props) {
  const e = errorReason(p.online, p.failed);
  const t = p.failed[0];
  const canRetryTask = p.online && !!t && !isRiskyTask(t);
  return (
    <div className="c-card err">
      <div className="err-glow" aria-hidden />
      <AxeMascot state="error" size={56} showBubble={false} badge="error" />
      <div className="err-text">
        <strong>{e.title}</strong>
        <span>{e.reason}</span>
        {p.retryMsg && <em className="err-msg">{p.retryMsg}</em>}
      </div>
      <div className="err-actions">
        {p.online && t && (
          <button type="button" className="c-link" onClick={() => p.onOpenShell()}>Open in AXE Core</button>
        )}
        <button
          type="button"
          className="retry"
          onClick={p.onRetry}
          disabled={p.retryBusy || (p.online && !!t && !canRetryTask)}
          title={!p.online ? "Try to reach AXE Core again" : canRetryTask ? "Queue this task again (safe retry, no send or order)" : "This one is retried in AXE Core, not from the notch"}
          aria-label="Retry"
        >
          ↻
        </button>
      </div>
    </div>
  );
}

function DropZone(p: Props) {
  return (
    <>
      <div className="c-card drop">
        <div className="drop-ring">
          <span className="drop-ic" aria-hidden>⇣</span>
          <strong>{p.pendingFiles.length ? "Add more, or ask AXE about these" : "Drop files here for AXE"}</strong>
          <span>Images, PDFs, docs and sheets become context for the chat.</span>
          {p.pendingFiles.length > 0 && (
            <div className="chips">
              {p.pendingFiles.map((f, i) => (
                <span key={`${f.name}-${i}`} className="chip">
                  <em>{f.kind}</em>{f.name}
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => p.onRemoveFile(i)}>×</button>
                </span>
              ))}
              <button type="button" className="c-link" onClick={p.onAskFiles}>Ask AXE →</button>
            </div>
          )}
        </div>
      </div>
      <div className="c-card side" aria-label="Live agents">
        {p.live.length === 0 ? <span className="c-empty small">No live agents</span> : agentPills(p.live, 6).map((x) => (
          <span key={x.id} className={`side-dot c-${x.color}`} title={`${x.agent}: ${x.text}`}>{x.agent.slice(0, 1)}</span>
        ))}
      </div>
    </>
  );
}
