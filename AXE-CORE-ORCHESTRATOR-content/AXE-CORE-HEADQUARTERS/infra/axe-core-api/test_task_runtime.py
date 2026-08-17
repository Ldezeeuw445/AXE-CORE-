import unittest

from task_runtime import redact_event_data, require_transition
from task_worker import TaskWorker, normalize_agent_result, verification_evidence


class TaskStateMachineTest(unittest.TestCase):
    def test_valid_workflow(self):
        for current, target in [
            ("queued", "planning"),
            ("planning", "running"),
            ("running", "waiting_approval"),
            ("waiting_approval", "queued"),
            ("running", "verifying"),
            ("verifying", "completed"),
        ]:
            require_transition(current, target)

    def test_terminal_task_cannot_restart(self):
        with self.assertRaisesRegex(ValueError, "invalid task transition"):
            require_transition("completed", "running")

    def test_skipping_from_queue_to_completed_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "invalid task transition"):
            require_transition("queued", "completed")

    def test_event_secrets_are_redacted(self):
        clean = redact_event_data({
            "status": "ok",
            "api_key": "do-not-store",
            "Authorization": "Bearer secret",
            "nested_summary": "safe",
        })
        self.assertEqual(clean["status"], "ok")
        self.assertEqual(clean["api_key"], "[REDACTED]")
        self.assertEqual(clean["Authorization"], "[REDACTED]")
        self.assertEqual(clean["nested_summary"], "safe")


class FakeWorkerRepository:
    def __init__(self):
        self.transitions = []
        self.events = []
        self.task = {
            "id": "task-1", "capability": "agentic", "worker_id": "worker-1",
            "lease_token": "lease-1", "attempt": 1, "max_attempts": 3,
            "checkpoint": {}, "status": "running",
        }

    def claim(self, worker_id, lease_seconds):
        self.task["worker_id"] = worker_id
        return dict(self.task)

    def heartbeat(self, task_id, worker_id, lease_token, lease_seconds, checkpoint):
        self.task["checkpoint"] = checkpoint or {}
        return dict(self.task)

    def transition(self, task_id, status, **kwargs):
        self.transitions.append(status)
        self.task.update({"status": status, **{k: v for k, v in kwargs.items() if v is not None}})
        return dict(self.task)

    def append_event(self, task_id, event_type, **kwargs):
        self.events.append(event_type)
        return {"event_type": event_type}


class TaskWorkerTest(unittest.IsolatedAsyncioTestCase):
    async def test_handler_is_verified_and_completed(self):
        repo = FakeWorkerRepository()

        async def handler(task, context):
            await context.checkpoint({"stage": "worked"})
            return {"summary": "done", "openhands_task_id": "oh-1"}

        worker = TaskWorker(repo, {"agentic": handler}, worker_id="worker-1")
        self.assertTrue(await worker.run_once())
        self.assertEqual(repo.transitions, ["verifying", "completed"])
        self.assertIn("verification.passed", repo.events)

    def test_openhands_finish_envelopes_are_normalized(self):
        self.assertEqual(
            normalize_agent_result('{"name":"finish","parameters":{"message":"Done by AXE"}}'),
            "Done by AXE",
        )
        self.assertEqual(
            normalize_agent_result('{"name":"finish","message":"Completed"}'),
            "Completed",
        )

    def test_verification_requires_real_agent_evidence(self):
        self.assertFalse(verification_evidence({"summary": "done"})["passed"])
        evidence = verification_evidence({"summary": "done", "openhands_task_id": "oh-1"})
        self.assertTrue(evidence["passed"])
        self.assertEqual(len(evidence["checks"]), 3)


if __name__ == "__main__":
    unittest.main()
