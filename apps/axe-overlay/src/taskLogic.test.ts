import { test } from "node:test";
import assert from "node:assert/strict";
import { FAILED_WINDOW_MS, isDangerousApproval, isRiskyTask, splitTasks } from "./taskLogic.ts";

test("splitTasks: live, failed within 2h, done since midnight", () => {
  const now = new Date(2026, 10, 27, 14, 0, 0).getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  const r = splitTasks(
    [
      { id: "1", status: "running" },
      { id: "2", status: "waiting_approval" },
      { id: "3", status: "failed", updated_at: iso(now - 10 * 60_000) },
      { id: "4", status: "failed", updated_at: iso(now - FAILED_WINDOW_MS - 1) },
      { id: "5", status: "done", updated_at: iso(now - 60 * 60_000) },
      { id: "6", status: "done", updated_at: iso(now - 20 * 60 * 60_000) },
      { id: "7", status: "failed" },
    ],
    now,
  );
  assert.deepEqual(r.live.map((t) => t.id), ["1", "2"]);
  assert.deepEqual(r.failed.map((t) => t.id), ["3"]);
  assert.equal(r.doneToday, 1);
});

test("notch never retries risky tasks or approves trades/payments", () => {
  assert.equal(isRiskyTask({ id: "1", title: "Send NorthSea mail to buyer" }), true);
  assert.equal(isRiskyTask({ id: "1", title: "Deploy HQ" }), true);
  assert.equal(isRiskyTask({ id: "1", capability: "trading", title: "Place order" }), true);
  assert.equal(isRiskyTask({ id: "1", title: "Set up Review Desk workspace" }), false);
  assert.equal(isDangerousApproval({ id: "a", kind: "payment" }), true);
});
