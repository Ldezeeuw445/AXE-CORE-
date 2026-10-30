import { DEFAULT_API_ORIGIN, authHeaders, loadLocalConfig } from "./config";

export type LiveTask = {
  id: string;
  title?: string;
  status?: string;
  capability?: string;
  goal?: string;
};

export type ApprovalItem = {
  id: string;
  title?: string;
  detail?: string;
  kind?: string;
  status?: string;
  task_id?: string;
};

async function originAndKey() {
  const c = await loadLocalConfig();
  return {
    origin: (c.apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, ""),
    key: c.apiKey,
  };
}

export async function fetchLiveTasks(): Promise<LiveTask[]> {
  const { origin, key } = await originAndKey();
  if (!key) return [];
  try {
    const r = await fetch(`${origin}/tasks?limit=30`, {
      headers: authHeaders(key),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { tasks?: LiveTask[] };
    const tasks = data.tasks || [];
    return tasks.filter((t) => {
      const s = String(t.status || "").toLowerCase();
      return ["running", "in_progress", "claimed", "active", "queued", "waiting_approval"].includes(s);
    });
  } catch {
    return [];
  }
}

export async function fetchApprovals(): Promise<ApprovalItem[]> {
  const { origin, key } = await originAndKey();
  if (!key) return [];
  try {
    const r = await fetch(`${origin}/approvals?status=pending&limit=12`, {
      headers: authHeaders(key),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { approvals?: ApprovalItem[] };
    return data.approvals || [];
  } catch {
    return [];
  }
}

export function classifyActivity(tasks: LiveTask[]): {
  computer: number;
  browser: number;
  other: number;
} {
  let computer = 0;
  let browser = 0;
  let other = 0;
  for (const t of tasks) {
    const cap = `${t.capability || ""} ${t.title || ""} ${t.goal || ""}`.toLowerCase();
    if (cap.includes("computer") || cap.includes("computer_use")) computer += 1;
    else if (cap.includes("browser")) browser += 1;
    else other += 1;
  }
  return { computer, browser, other };
}
