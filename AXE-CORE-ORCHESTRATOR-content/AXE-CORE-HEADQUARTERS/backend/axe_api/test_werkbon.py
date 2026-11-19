"""Punt 3: coding-worker als interne medewerker -- werkbon erin, oplevering eruit."""
import json

import device_actions as da


def test_werkbon_heeft_scope_af_is_af_en_drie_kopjes_en_is_idempotent():
    w = da.werkbon("Maak de alerts-tab af in AXE-COMPANION-OS-")
    assert "OPDRACHT:\nMaak de alerts-tab af" in w
    assert "SCOPE:" in w and "AF IS AF" in w and "Niet mergen, niet deployen" in w
    assert all(f"## {k}" in w for k in da.KOPJES)
    assert da.werkbon(w) == w


AGENT = """Ik heb de alerts-tab afgemaakt.

## Samenvatting
Alerts-tab toont nu live meldingen; lege staat toegevoegd.

## Tests
npx vitest run src/alerts -> 12 passed

## Risico's
Niet getest op de telefoon.
"""

MAC = """
## Oplevering (Mac)
branch: axe/20261119-abc123
worktree: /Users/luka/.axe/worktrees/axe-core-20261119-abc123
commits:
1a2b3c4 feat(alerts): live meldingen
diff:
 src/alerts/Alerts.tsx | 40 ++++++++++++++++++++++++++++++++++++++++
 1 file changed, 40 insertions(+)
"""


def test_oplevering_uit_claude_json_plus_mac_feiten():
    uit = da.oplevering(json.dumps({"type": "result", "result": AGENT}) + MAC)
    assert uit["samenvatting"].startswith("Alerts-tab toont nu live meldingen")
    assert uit["tests"] == "npx vitest run src/alerts -> 12 passed"
    assert uit["risicos"] == "Niet getest op de telefoon."
    assert uit["branch"] == "axe/20261119-abc123"
    assert uit["commits"] == "1a2b3c4 feat(alerts): live meldingen"
    assert "1 file changed" in uit["diff"]
    assert uit["compleet"] is True


def test_oplevering_zegt_wat_ontbreekt():
    uit = da.oplevering("Ik heb wat gedaan, geen kopjes.")
    assert uit["compleet"] is False and uit["ontbreekt"] == list(da.KOPJES)


def test_run_on_device_zet_de_werkbon_erom():
    gestuurd = {}

    class Q:
        def __init__(self, naam): self.naam, self.rij = naam, None
        def select(self, *_): return self
        def eq(self, *_): return self
        def limit(self, *_): return self
        def insert(self, rij): gestuurd.update(rij); self.rij = rij; return self
        def execute(self):
            if self.naam == "core_computer_workers":
                from datetime import datetime, timezone
                return type("R", (), {"data": [{"device_id": "mac-mini", "host": "mini",
                                                "workspaces": ["AXE Core"],
                                                "heartbeat_at": datetime.now(timezone.utc).isoformat()}]})()
            if self.rij is not None:
                return type("R", (), {"data": [{"id": "t1"}]})()
            return type("R", (), {"data": [{"status": "completed", "result": {"output": AGENT + MAC}}]})()

    class DB:
        def table(self, naam): return Q(naam)

    uit = da.run_on_device("mac-mini", "claude_code.run", {"prompt": "Fix de login"}, db=DB(), sleep=lambda _: None)
    assert gestuurd["payload"]["args"]["prompt"].startswith(da.WERKBON_KOP)
    assert uit["ok"] and uit["oplevering"]["compleet"] is True


def test_niet_gecommit_werk_is_niet_af():
    mac = MAC.replace("diff:", "niet gecommit:\n M src/x.ts\ndiff:")
    uit = da.oplevering(AGENT + mac)
    assert uit["commits"] == "1a2b3c4 feat(alerts): live meldingen"
    assert uit["niet_gecommit"] == "M src/x.ts" and uit["compleet"] is False
