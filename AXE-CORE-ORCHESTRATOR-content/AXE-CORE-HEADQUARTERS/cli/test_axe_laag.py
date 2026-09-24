"""Parser, hek en JSON van de Python-laag. Geen netwerk. stdlib-unittest."""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from axe_laag.laag import decide_guard, dumps, envelope, help_text, parse_argv

CLI = Path(__file__).resolve().parent / "axe"


class TestLaag(unittest.TestCase):
    def test_help_noemt_elk_commando(self):
        tekst = help_text()
        for stuk in ("status", "tasks list", "agent run", "memory search", "northsea", "notify", "report"):
            self.assertIn(stuk.split()[0], tekst)

    def test_json_envelop_heeft_exitcodes(self):
        self.assertEqual(envelope("status", "ok")["exit"], 0)
        self.assertEqual(envelope("x", "blocked", error="no")["exit"], 3)
        self.assertEqual(envelope("x", "pending_approval")["exit"], 4)
        raw = dumps(envelope("status", "ok", {"api_key": "secret", "ok": True}))
        parsed = json.loads(raw)
        self.assertEqual(parsed["result"]["api_key"], "[REDACTED]")
        self.assertTrue(parsed["result"]["ok"])

    def test_write_vlag_en_aliassen(self):
        self.assertTrue(parse_argv(["notify", "hi", "--write"])["write"])
        self.assertEqual(parse_argv(["tasks", "wait", "id"])["path"], "task wait")
        self.assertEqual(parse_argv(["agents", "run", "trading", "scan"])["path"], "agent run")

    def test_blokkades_niet_te_omzeilen(self):
        gevallen = (
            ("agent run northsea verstuur het concept", "email"),
            ("set auto_send_qualification=true", "northsea_flag"),
            ("git push origin HEAD:orchestrator", "merge"),
            ("delete all core_tasks", "delete"),
        )
        for raw, code in gevallen:
            d = decide_guard("agent run", raw, True)
            self.assertEqual(d["kind"], "blocked", raw)
            self.assertEqual(d["code"], code, raw)

    def test_cli_help_json_via_subprocess(self):
        proc = subprocess.run(
            [sys.executable, str(CLI), "help", "--json"],
            check=False, capture_output=True, text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = json.loads(proc.stdout)
        self.assertTrue(data["ok"])
        self.assertIn("axe status", data["result"]["help"])

    def test_cli_blokkeert_verstuur(self):
        proc = subprocess.run(
            [sys.executable, str(CLI), "agent", "run", "northsea", "verstuur dit", "--write", "--json"],
            check=False, capture_output=True, text=True,
            env={"AXE_API_KEY": "test", "PATH": "/usr/bin"},
        )
        data = json.loads(proc.stdout)
        self.assertEqual(data["status"], "blocked")
        self.assertEqual(proc.returncode, 3)


if __name__ == "__main__":
    unittest.main()
