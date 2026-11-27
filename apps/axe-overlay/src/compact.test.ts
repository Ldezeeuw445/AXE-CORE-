import { test } from "node:test";
import assert from "node:assert/strict";
import { agentPills, compactState, errorReason, greeting, stepRows, waitingLine, GREETING_MS } from "./compact.ts";

const base = { online: true, dragging: false, live: [], failed: [], openForMs: GREETING_MS + 1 };

test("state priority: drop > error > working > greeting > idle", () => {
  const live = [{ id: "1", status: "running" }];
  const failed = [{ id: "2", status: "failed" }];
  assert.equal(compactState({ ...base, dragging: true, failed, live }), "drop");
  assert.equal(compactState({ ...base, hasFiles: true }), "drop");
  assert.equal(compactState({ ...base, failed, live }), "error");
  assert.equal(compactState({ ...base, online: false }), "error");
  assert.equal(compactState({ ...base, live }), "working");
  assert.equal(compactState({ ...base, openForMs: 10 }), "greeting");
  assert.equal(compactState(base), "idle");
});

test("greeting by hour", () => {
  assert.equal(greeting(3), "Still up");
  assert.equal(greeting(9), "Good morning");
  assert.equal(greeting(14), "Good afternoon");
  assert.equal(greeting(21), "Good evening");
});

test("agent pills: max 4, manager colour + label, status verb", () => {
  const tasks = [
    { id: "a", title: "Research", status: "running", requested_by: "northsea" },
    { id: "b", title: "Draft", status: "waiting_approval", requested_by: "companion" },
    { id: "c", goal: "Backtest", status: "queued", requested_by: "trading" },
    { id: "d", title: "Lint", status: "claimed", capability: "agentic" },
    { id: "e", title: "Extra", status: "running" },
  ];
  const p = agentPills(tasks);
  assert.equal(p.length, 4);
  assert.deepEqual(p.map((x) => x.agent), ["NorthSea", "Companion", "Trading OS", "Agentic"]);
  assert.deepEqual(p.map((x) => x.status), ["Working", "Waiting on you", "Queued", "Starting"]);
  assert.equal(p[0].color, "blue");
  assert.equal(p[2].text, "Backtest");
});

test("step rows: marks, order, window of 4 around the current step", () => {
  const steps = [
    { id: "1", title: "A", step_order: 1, status: "done" },
    { id: "2", title: "B", step_order: 2, status: "done" },
    { id: "3", title: "C", step_order: 3, status: "done" },
    { id: "4", title: "D", step_order: 4, status: "running" },
    { id: "5", title: "E", step_order: 5, status: "pending" },
    { id: "6", title: "F", step_order: 6, status: "pending" },
  ];
  const r = stepRows([...steps].reverse());
  assert.deepEqual(r.map((x) => x.title), ["C", "D", "E", "F"]);
  assert.deepEqual(r.map((x) => x.mark), ["done", "current", "todo", "todo"]);
  assert.deepEqual(stepRows([]), []);
});

test("error reason: offline vs failed task (+more)", () => {
  assert.match(errorReason(false, []).title, /Can't reach AXE Core/);
  const e = errorReason(true, [
    { id: "x", title: "Set up desk", requested_by: "axe-core", error: "lease expired" },
    { id: "y", title: "Other" },
  ]);
  assert.equal(e.title, "Core couldn't finish");
  assert.match(e.reason, /Set up desk \(\+1 more\) · lease expired/);
});

test("waiting line", () => {
  assert.equal(waitingLine([]), "Nothing waiting on you");
  assert.equal(waitingLine([{ id: "1" }]), "1 thing waiting on you");
  assert.equal(waitingLine([{ id: "1" }, { id: "2" }]), "2 things waiting on you");
});
