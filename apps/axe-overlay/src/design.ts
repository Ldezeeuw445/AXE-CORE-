/**
 * Design/test mode for screenshots ONLY: `?ontwerp=1&state=…` in a plain
 * browser against the Vite dev server. Never active inside the Tauri app
 * (that has __TAURI_INTERNALS__) and never in a production build, so the real
 * notch only ever shows real data.
 */
import type { ApprovalItem, LiveTask, TaskStep } from "./taskLogic.ts";

export type DesignState =
  | "working"
  | "greeting"
  | "idle"
  | "error"
  | "offline"
  | "drop"
  | "widgets"
  | "large"
  | "empty";

export function designState(env: {
  dev: boolean;
  tauri: boolean;
  search: string;
}): DesignState | null {
  if (!env.dev || env.tauri) return null;
  const q = new URLSearchParams(env.search);
  if (!q.has("ontwerp")) return null;
  const s = q.get("state") || "working";
  const all: DesignState[] = ["working", "greeting", "idle", "error", "offline", "drop", "widgets", "large", "empty"];
  return (all as string[]).includes(s) ? (s as DesignState) : "working";
}

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

/** Layout-only sample data (clearly fake; only for design screenshots). */
export function designData(state: DesignState): {
  online: boolean;
  live: LiveTask[];
  failed: LiveTask[];
  doneToday: number;
  approvals: ApprovalItem[];
  steps: TaskStep[];
} {
  const live: LiveTask[] = [
    { id: "d1", title: "Research Q4 freight rates", status: "running", requested_by: "northsea", created_at: ago(4) },
    { id: "d2", title: "Draft deal follow-up", status: "running", requested_by: "companion", created_at: ago(9) },
    { id: "d3", title: "Backtest EURUSD breakout", status: "queued", requested_by: "trading", created_at: ago(12) },
    { id: "d4", title: "Fix lint in Home tiles", status: "waiting_approval", requested_by: "axe-core", created_at: ago(20) },
  ];
  const steps: TaskStep[] = [
    { id: "s1", title: "Start working", step_order: 1, status: "done" },
    { id: "s2", title: "Prep workspace", step_order: 2, status: "running" },
    { id: "s3", title: "Collect sources", step_order: 3, status: "pending" },
    { id: "s4", title: "Copy final outputs", step_order: 4, status: "pending" },
  ];
  const approvals: ApprovalItem[] = [
    { id: "a1", title: "Send NorthSea draft to buyer", kind: "mail" },
    { id: "a2", title: "Merge PR: Home v7 tiles", kind: "pr" },
    { id: "a3", title: "Enable Planner cron", kind: "cron" },
  ];
  const failed: LiveTask[] = [
    { id: "f1", title: "Set up Review Desk workspace", status: "failed", requested_by: "axe-core", error: "worker lease expired", updated_at: ago(3) },
  ];
  switch (state) {
    case "error":
      return { online: true, live: [], failed, doneToday: 6, approvals, steps: [] };
    case "offline":
      return { online: false, live: [], failed: [], doneToday: 0, approvals: [], steps: [] };
    case "greeting":
    case "idle":
      return { online: true, live: [], failed: [], doneToday: 6, approvals, steps: [] };
    case "empty":
      return { online: true, live: [], failed: [], doneToday: 0, approvals: [], steps: [] };
    default:
      return { online: true, live, failed: [], doneToday: 6, approvals, steps };
  }
}
