import unittest

from task_runtime import redact_event_data, require_transition


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


if __name__ == "__main__":
    unittest.main()
