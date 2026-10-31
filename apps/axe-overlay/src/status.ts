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

/** Never approve real trades or payments from the notch. */
export function isDangerousApproval(a: ApprovalItem): boolean {
  const blob = `${a.kind || ""} ${a.title || ""} ${a.detail || ""}`.toLowerCase();
  return /trade|trading|order|payment|pay|transfer|wire|sepa|iban|invoice.?pay|purchase|buy\b|sell\b/.test(
    blob,
  );
}

export async function decideApproval(
  item: ApprovalItem,
  approved: boolean,
  reason = "notch F15",
): Promise<{ ok: boolean; message: string }> {
  if (approved && isDangerousApproval(item)) {
    return {
      ok: false,
      message: "Geblokkeerd: trades/payments nooit via notch-goedkeuring. Doe dit in AXE CORE.",
    };
  }
  const { origin, key } = await originAndKey();
  if (!key) return { ok: false, message: "Geen API key" };
  const taskId = item.task_id;
  if (!taskId) return { ok: false, message: "Approval mist task_id" };
  try {
    const r = await fetch(
      `${origin}/tasks/${encodeURIComponent(taskId)}/approvals/${encodeURIComponent(item.id)}/decision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(key) },
        body: JSON.stringify({ approved, decided_by: "luka", reason }),
      },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { ok: false, message: `Decision ${r.status}: ${body.slice(0, 140)}` };
    }
    return { ok: true, message: approved ? "Goedgekeurd" : "Afgewezen" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function fetchNorthseaBrief(): Promise<string> {
  const { origin, key } = await originAndKey();
  if (!key) return "Geen API key";
  try {
    const r = await fetch(`${origin}/northsea/overzicht`, { headers: authHeaders(key) });
    if (!r.ok) return `NorthSea ${r.status}`;
    const d = (await r.json()) as {
      pipeline?: number;
      actief?: number;
      tellers?: Record<string, number>;
      kaart?: Array<{ naam?: string; status?: string; next?: string; titel?: string }>;
    };
    const t = d.tellers || {};
    const top = (d.kaart || []).slice(0, 5);
    const lines = [
      `NorthSea — pipeline ${d.pipeline ?? "?"} · actief ${d.actief ?? "?"}`,
      `7d: comm ${t.communicatie_7d ?? 0} · contacten ${t.contacten ?? 0} · campagnes ${t.campagnes ?? 0}`,
    ];
    for (const k of top) {
      lines.push(`• ${k.naam || k.titel || "deal"} — ${k.status || "?"}${k.next ? ` → ${k.next}` : ""}`);
    }
    if (top.length === 0) lines.push("Geen open deal-kaarten in overzicht.");
    return lines.join("\n");
  } catch (e) {
    return `NorthSea fout: ${(e as Error).message}`;
  }
}

export async function fetchDailyBrief(
  approvals: ApprovalItem[],
  tasks: LiveTask[],
): Promise<string> {
  const { origin, key } = await originAndKey();
  const parts: string[] = ["AXE daily brief"];
  parts.push(`Approvals pending: ${approvals.length}`);
  for (const a of approvals.slice(0, 3)) {
    parts.push(`  • ${a.title || a.kind || a.id}${isDangerousApproval(a) ? " ⚠ trade/pay" : ""}`);
  }
  parts.push(`Live tasks: ${tasks.length}`);
  if (key) {
    try {
      const ns = await fetch(`${origin}/northsea/overzicht`, { headers: authHeaders(key) });
      if (ns.ok) {
        const d = (await ns.json()) as { actief?: number; pipeline?: number };
        parts.push(`NorthSea: ${d.actief ?? "?"} actief / pipeline ${d.pipeline ?? "?"}`);
      }
    } catch { /* ignore */ }
    try {
      const tr = await fetch(`${origin}/trading/overview`, { headers: authHeaders(key) });
      if (tr.ok) {
        const d = (await tr.json()) as { accounts?: Array<{ label?: string; enabled?: boolean }> };
        const demos = (d.accounts || []).filter((a) => /demo/i.test(a.label || ""));
        parts.push(
          `Trading demo: ${demos.map((a) => a.label).join(", ") || "geen demo-accounts"}`,
        );
      }
    } catch { /* ignore */ }
    try {
      const st = await fetch(`${origin}/status/axe-core`, { headers: authHeaders(key) });
      if (st.ok) {
        const d = (await st.json()) as { online?: boolean; provider?: string };
        parts.push(`App status: ${d.online ? "online" : "offline"} · provider ${d.provider || "?"}`);
      }
    } catch { /* ignore */ }
  }
  return parts.join("\n");
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

export const MANAGERS = [
  { id: "axe", label: "AXE" },
  { id: "projects", label: "Projects" },
  { id: "axe-core", label: "CORE" },
  { id: "companion", label: "Companion" },
  { id: "trading", label: "Trading OS" },
  { id: "axon", label: "AXON" },
  { id: "northsea", label: "NorthSea" },
] as const;

export type ManagerId = (typeof MANAGERS)[number]["id"];
