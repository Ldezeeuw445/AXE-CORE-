/** AXE Autonomous Planner Client — create and execute multi-step plans. */

import { api } from "./api";

/**
 * Create a task plan for a given goal.
 * @param {string} goal - The high-level goal
 * @param {string} context - Additional context
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<object>} Plan object with steps
 */
export async function createPlan(goal, context = null, sessionId = null) {
  const res = await api.post("/planner/create", {
    goal,
    context,
    session_id: sessionId,
  });
  return res.data;
}

/**
 * Execute an existing plan.
 * @param {object} plan - The plan object (from createPlan)
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<object>} Executed plan with results
 */
export async function executePlan(plan, sessionId = null) {
  const res = await api.post("/planner/execute", {
    plan,
    session_id: sessionId,
  });
  return res.data;
}

/**
 * Create and execute a plan in one request.
 * @param {string} goal - The high-level goal
 * @param {string} context - Additional context
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<object>} Executed plan
 */
export async function runPlan(goal, context = null, sessionId = null) {
  const res = await api.post("/planner/run", {
    goal,
    context,
    session_id: sessionId,
  });
  return res.data;
}

/**
 * Format plan steps for display in chat.
 * @param {object} plan
 * @returns {string}
 */
export function formatPlanForChat(plan) {
  if (!plan || !plan.steps) return "[No plan available]";

  const lines = [`📋 Plan: ${plan.goal}`];
  if (plan.description) lines.push(plan.description);
  lines.push("");

  plan.steps.forEach((step, i) => {
    const statusEmoji = {
      completed: "✅",
      failed: "❌",
      running: "⏳",
      pending: "⏸",
      cancelled: "🚫",
    }[step.status] || "⏸";

    lines.push(`${statusEmoji} Step ${i + 1}: ${step.description}`);
    if (step.action_id) {
      lines.push(`   └─ Action: ${step.action_id}`);
    }
    if (step.result?.analysis) {
      lines.push(`   └─ Result: ${step.result.analysis.slice(0, 120)}...`);
    } else if (step.error) {
      lines.push(`   └─ Error: ${step.error}`);
    }
  });

  lines.push("");
  lines.push(`Plan status: ${plan.status.toUpperCase()}`);
  return lines.join("\n");
}
