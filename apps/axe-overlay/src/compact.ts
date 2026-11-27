/**
 * Notch v2 compact strip: which state to show and what goes in it.
 * Pure logic (no React/Tauri) so it is unit-tested.
 */
import type { ApprovalItem, LiveTask, TaskStep } from "./taskLogic.ts";

export type CompactState = "drop" | "error" | "working" | "greeting" | "idle";

export type CompactInput = {
  online: boolean;
  dragging: boolean;
  /** Files dropped and waiting as chips (shown until sent or removed). */
  hasFiles?: boolean;
  live: LiveTask[];
  failed: LiveTask[];
  /** ms since the strip opened; the greeting shows for the first few seconds. */
  openForMs: number;
};

/** How long the greeting stays before the idle summary takes over. */
export const GREETING_MS = 6000;

export function compactState(i: CompactInput): CompactState {
  if (i.dragging || i.hasFiles) return "drop";
  if (!i.online || i.failed.length > 0) return "error";
  if (i.live.length > 0) return "working";
  if (i.openForMs < GREETING_MS) return "greeting";
  return "idle";
}

export function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** One colour per AXE manager / agent, so a pill is recognisable at a glance. */
const AGENT_COLORS: Record<string, string> = {
  axe: "cyan",
  projects: "violet",
  "axe-core": "teal",
  companion: "orange",
  trading: "red",
  axon: "purple",
  northsea: "blue",
};
const FALLBACK_COLORS = ["teal", "red", "orange", "purple", "blue", "violet"];

export type AgentPill = {
  id: string;
  agent: string;
  text: string;
  color: string;
  status: string;
};

const AGENT_LABELS: Record<string, string> = {
  axe: "AXE",
  projects: "Projects",
  "axe-core": "Core",
  companion: "Companion",
  trading: "Trading OS",
  axon: "AXON",
  northsea: "NorthSea",
};

export function agentOf(t: LiveTask): string {
  const raw = String(t.requested_by || t.capability || "axe").toLowerCase().trim();
  return raw || "axe";
}

export function agentLabel(agent: string): string {
  return AGENT_LABELS[agent] || agent.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function colorFor(agent: string, i: number): string {
  return AGENT_COLORS[agent] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

export function taskTitle(t: LiveTask): string {
  return String(t.title || t.goal || t.capability || "task").replace(/\s+/g, " ").trim();
}

export function statusVerb(status?: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "waiting_approval") return "Waiting on you";
  if (s === "queued") return "Queued";
  if (s === "claimed") return "Starting";
  return "Working";
}

/** Max 4 pills (2×2), live tasks first, one pill per task. */
export function agentPills(tasks: LiveTask[], max = 4): AgentPill[] {
  return tasks.slice(0, max).map((t, i) => {
    const agent = agentOf(t);
    return {
      id: t.id,
      agent: agentLabel(agent),
      text: taskTitle(t),
      color: colorFor(agent, i),
      status: statusVerb(t.status),
    };
  });
}

export type StepRow = { id: string; title: string; mark: "done" | "current" | "todo" | "failed" };

/** Step list for the focused task: max 4 rows, centred on the current step. */
export function stepRows(steps: TaskStep[], max = 4): StepRow[] {
  const sorted = [...steps].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0));
  const rows: StepRow[] = sorted.map((s) => {
    const st = String(s.status || "").toLowerCase();
    const mark: StepRow["mark"] =
      ["done", "completed", "succeeded", "skipped"].includes(st)
        ? "done"
        : ["running", "in_progress", "active", "claimed"].includes(st)
          ? "current"
          : ["failed", "error"].includes(st)
            ? "failed"
            : "todo";
    return { id: s.id, title: String(s.title || s.step_key || "step"), mark };
  });
  if (rows.length <= max) return rows;
  let cur = rows.findIndex((r) => r.mark === "current" || r.mark === "failed");
  if (cur < 0) cur = rows.findIndex((r) => r.mark === "todo");
  if (cur < 0) cur = rows.length - 1;
  const start = Math.max(0, Math.min(cur - 1, rows.length - max));
  return rows.slice(start, start + max);
}

/** Short, human reason for the error card. */
export function errorReason(online: boolean, failed: LiveTask[]): { title: string; reason: string } {
  if (!online) return { title: "Can't reach AXE Core", reason: "The API did not answer. Check the network or the API key." };
  const t = failed[0];
  const more = failed.length > 1 ? ` (+${failed.length - 1} more)` : "";
  const err = t?.error ? String(typeof t.error === "string" ? t.error : JSON.stringify(t.error)) : "";
  return {
    title: `${agentLabel(agentOf(t))} couldn't finish`,
    reason: `${taskTitle(t)}${more}${err ? ` · ${err.slice(0, 80)}` : ""}`,
  };
}

/** Waiting-on-you headline, singular/plural. */
export function waitingLine(approvals: ApprovalItem[]): string {
  const n = approvals.length;
  if (n === 0) return "Nothing waiting on you";
  return n === 1 ? "1 thing waiting on you" : `${n} things waiting on you`;
}
