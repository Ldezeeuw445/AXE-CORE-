/** Pure task/approval logic for the notch (no Tauri, no fetch) so node:test can import it. */

export type LiveTask = {
  id: string;
  title?: string;
  status?: string;
  capability?: string;
  goal?: string;
  requested_by?: string;
  error?: unknown;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
};

export type TaskStep = {
  id: string;
  title?: string;
  step_key?: string;
  step_order?: number;
  status?: string;
};

export type ApprovalItem = {
  id: string;
  title?: string;
  detail?: string;
  kind?: string;
  status?: string;
  task_id?: string;
};

const LIVE_STATUSES = ["running", "in_progress", "claimed", "active", "queued", "waiting_approval"];
const FAILED_STATUSES = ["failed", "blocked"];
/** A failed task only counts as "now" for the notch error card for 2 hours. */
export const FAILED_WINDOW_MS = 2 * 60 * 60 * 1000;

export type TaskBoard = {
  /** false = no API key configured (honest "not connected" state). */
  connected: boolean;
  live: LiveTask[];
  failed: LiveTask[];
  doneToday: number;
};

/** Split one /tasks page into live / recently failed / done today. Pure. */
export function splitTasks(tasks: LiveTask[], now: number): Omit<TaskBoard, "connected"> {
  const live: LiveTask[] = [];
  const failed: LiveTask[] = [];
  let doneToday = 0;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  for (const t of tasks) {
    const s = String(t.status || "").toLowerCase();
    const at = Date.parse(t.updated_at || t.completed_at || t.created_at || "");
    if (LIVE_STATUSES.includes(s)) live.push(t);
    else if (FAILED_STATUSES.includes(s) && Number.isFinite(at) && now - at < FAILED_WINDOW_MS) failed.push(t);
    else if (["done", "completed", "succeeded"].includes(s) && Number.isFinite(at) && at >= midnight.getTime()) doneToday += 1;
  }
  return { live, failed, doneToday };
}

/** Never re-queue anything that smells like a trade, payment, send or deploy from the notch. */
export function isRiskyTask(t: LiveTask): boolean {
  const blob = `${t.capability || ""} ${t.title || ""} ${t.goal || ""}`.toLowerCase();
  return /trade|trading|order|payment|pay\b|transfer|wire|sepa|iban|purchase|buy\b|sell\b|deploy|release|send|mail|publish|merge/.test(blob);
}

/** Never approve real trades or payments from the notch. */
export function isDangerousApproval(a: ApprovalItem): boolean {
  const blob = `${a.kind || ""} ${a.title || ""} ${a.detail || ""}`.toLowerCase();
  return /trade|trading|order|payment|pay|transfer|wire|sepa|iban|invoice.?pay|purchase|buy\b|sell\b/.test(
    blob,
  );
}

