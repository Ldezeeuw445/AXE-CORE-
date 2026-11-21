"""AXE beslist zelf: in-plan auto, harde grens vraagt, deals ontdubbelen."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beslis_beleid import (
    ACTIE_ASK,
    ACTIE_AUTO,
    beslis_goedkeuring,
    bestaande_deal_vraag,
    is_inspectie,
    pas_beleid_toe_op_pending,
    shell_auto_reden,
    schrijft_eigen_artifacts,
)


def test_apt_list_en_artifacts_zijn_vrij():
    assert is_inspectie("apt list --installed")
    assert is_inspectie("apt list --installed 2>/dev/null")
    assert not is_inspectie("apt-get install jq")
    assert schrijft_eigen_artifacts("cat > /dax/artifacts/health.json <<'EOF'\n{}\nEOF")
    assert shell_auto_reden("apt list --installed")
    assert shell_auto_reden("cat > /dax/artifacts/out.txt", dax=True)
    assert not shell_auto_reden("apt-get install nginx")
    assert not shell_auto_reden("curl -X POST https://mt-client-api-v1.agiliumtrade.ai/trade")


def test_routines_auto_harde_grenzen_ask():
    auto = lambda **k: beslis_goedkeuring(k).actie
    assert auto(title="Market data check (trading)", kind="leave_plan") == ACTIE_AUTO
    assert auto(title="Orchestrator health check", kind="leave_plan") == ACTIE_AUTO
    assert auto(title="Idea scan: run dax…", detail="Idea scan: run dax", kind="leave_plan") == ACTIE_AUTO
    assert auto(
        title="AXE wants to run: apt list --installed",
        kind="shell_command",
        metadata={"command": "apt list --installed", "reason": "touches the system (apt)"},
    ) == ACTIE_AUTO
    assert auto(
        title="AXE wants to run: cat > /dax/artifacts/x",
        kind="shell_command",
        metadata={"command": "cat > /dax/artifacts/x"},
    ) == ACTIE_AUTO
    assert auto(title="Yes needed: DEAL-002 — Copper", kind="northsea_notice") == ACTIE_ASK
    assert auto(title="Send a new intro email to Acme", kind="leave_plan") == ACTIE_ASK
    assert auto(title="Place a live order on XAUUSD", kind="leave_plan") == ACTIE_ASK
    assert auto(title="Flip auto_send_followups", kind="leave_plan") == ACTIE_ASK
    assert auto(title="Pay the invoice", kind="leave_plan") == ACTIE_ASK
    assert auto(
        title="Send the qualification email to the seller",
        kind="leave_plan",
        metadata={"app": "northsea"},
    ) == ACTIE_AUTO


class _Tabel:
    def __init__(self, naam, db):
        self.naam = naam
        self.db = db
        self.actie = "select"
        self.filters = []
        self.patch = None

    def select(self, *_a):
        self.actie = "select"
        return self

    def eq(self, kolom, waarde):
        self.filters.append(("eq", kolom, waarde))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def update(self, rij):
        self.actie = "update"
        self.patch = dict(rij)
        return self

    def execute(self):
        rijen = self.db.setdefault(self.naam, [])
        match = [r for r in rijen if all(str(r.get(k)) == str(v) for _, k, v in self.filters)]
        if self.actie == "update" and self.patch:
            for r in match:
                r.update(self.patch)
            return type("R", (), {"data": match})()
        return type("R", (), {"data": match})()


class _Db:
    def __init__(self, rijen):
        self.rijen = rijen

    def table(self, naam):
        return _Tabel(naam, self.rijen)


def test_pas_beleid_keurt_inspectie_goed_en_ontdubbelt_deals():
    db = _Db({
        "core_approvals": [
            {
                "id": "a1", "status": "pending", "kind": "shell_command",
                "title": "apt list", "detail": "", "task_id": "t1",
                "metadata": {"command": "apt list --installed"},
            },
            {
                "id": "n1", "status": "pending", "kind": "northsea_notice",
                "title": "Yes needed: DEAL-002 — Copper", "detail": "first",
                "task_id": "d1", "metadata": {"deal_code": "DEAL-002"},
            },
            {
                "id": "n2", "status": "pending", "kind": "northsea_notice",
                "title": "Yes needed: DEAL-002 — Copper again", "detail": "dup",
                "task_id": "d2", "metadata": {"deal_code": "DEAL-002"},
            },
        ],
        "core_tasks": [
            {"id": "t1", "status": "waiting_approval", "metadata": {}},
            {"id": "d1", "status": "waiting_approval", "metadata": {"goedkeuring": "nodig"}},
            {"id": "d2", "status": "waiting_approval", "metadata": {"goedkeuring": "nodig"}},
        ],
    })
    uit = pas_beleid_toe_op_pending(db)
    assert uit["auto"] == 1
    assert uit["superseded"] == 1
    a1 = next(r for r in db.rijen["core_approvals"] if r["id"] == "a1")
    n1 = next(r for r in db.rijen["core_approvals"] if r["id"] == "n1")
    n2 = next(r for r in db.rijen["core_approvals"] if r["id"] == "n2")
    assert a1["status"] == "approved" and "in-plan" in a1["decision_reason"]
    assert n1["status"] == "pending"
    assert n2["status"] in ("superseded", "cancelled")
    assert bestaande_deal_vraag(db, deal_code="DEAL-002")["id"] == "n1"


def test_systemctl_kijken_mag_vanzelf_starten_niet():
    """15 nov: Luka moest steeds 'systemctl status northsea-desk-manager' goedkeuren."""
    from beslis_beleid import shell_auto_reden
    for vrij in ("systemctl status northsea-desk-manager", "systemctl status axe-core-api --no-pager -n 50",
                 "systemctl is-active northsea-mcp", "systemctl show northsea-mcp -p ActiveState",
                 "journalctl -u northsea-mcp --no-pager -n 100", "journalctl -u axe-core-api --since '1 hour ago' --no-pager"):
        assert shell_auto_reden(vrij) == "in-plan: read-only inspection", vrij
    for gevraagd in ("systemctl restart northsea-mcp", "systemctl stop axe-core-api", "systemctl status x; rm -rf /tmp/y",
                     "systemctl status x && systemctl restart x", "systemctl status $(cat /etc/passwd)",
                     "journalctl -u x | sh", "systemctl enable foo"):
        assert shell_auto_reden(gevraagd) is None, gevraagd


def test_bestand_lezen_mag_vanzelf_schrijven_niet():
    """15 nov: Luka keurde 'sed -n 1,200p …sql' goed; lezen verandert niets."""
    for vrij in ("sed -n '1,200p' supabase/migrations/20261015090000_northsea_deal_events_dedupe_index.sql",
                 "cat docs/tasks.json", "head -n 50 /var/log/syslog", "tail -n 100 app.log", "ls -la /opt/axe-core-api",
                 "grep -rn 'TODO' src", "wc -l main.py"):
        assert shell_auto_reden(vrij) == "in-plan: read-only inspection", vrij
    for gevraagd in ("cat x > y", "sed -i 's/a/b/' f", "cat a | sh", "cat $(echo /etc/passwd)", "head f; rm f",
                     "grep x f && rm f", "cat `id`", "tail -f log >> out"):
        assert shell_auto_reden(gevraagd) is None, gevraagd


def test_dax_eigen_werktak_pushen_mag_vanzelf_main_niet():
    """15 nov: elke 'git add . && git commit && git push origin dax/…' van een
    DAX-bot moest Luka los goedkeuren. Mergen blijft een PR."""
    for vrij in ("git add . && git commit -m ':axon-memory: Restore CI' && git push origin dax/0ad53df8-f71-axon-memory-restore-ci",
                 "git checkout dax/0ad53df8-f71 && git pull origin main && git checkout -b dax/0ad53df8-f72 && git add . && "
                 "git commit -m 'Update build list entry' && git push origin dax/0ad53df8-f72",
                 "git add docs/tasks.json && git commit -m \"Restore CI\" && git push -u origin dax/94024ad3-005-restore-ci"):
        assert shell_auto_reden(vrij, dax=True) == "in-plan: DAX pushes its own dax/* work branch (merge stays with Luka)", vrij
    for gevraagd in ("git push origin main", "git push origin orchestrator", "git add . && git commit -m x && git push origin main",
                     "git push --force origin dax/a", "git push -f origin dax/a", "git push origin dax/a; rm -rf /",
                     "git checkout -b feature/axe-task-A0-1 && git add . && git commit -m 'feat' && git push origin feature/axe-task-A0-1",
                     "git commit -m \"$(cat /etc/passwd)\" && git push origin dax/a", "git push origin :refs/heads/main",
                     "git add . && git commit -m 'x' && git push origin dax/a && python3 -c 'print(1)'",
                     "git push origin --delete dax/a"):
        assert shell_auto_reden(gevraagd, dax=True) is None, gevraagd


def test_managervraag_over_betaling_of_login_blijft_bij_luka():
    vraag = {"kind": "manager_ask", "title": "Vaste jobs falen achter elkaar",
             "detail": "Ik heb zelf gekeken; hier ben jij voor nodig: Luka must top up MetaAPI account."}
    assert beslis_goedkeuring(vraag).actie == ACTIE_ASK
    # Een gewone managervraag zonder betaling/login blijft in-plan.
    gewoon = {"kind": "manager_ask", "title": "Dubbele voorstellen opruimen", "detail": "3 dubbel."}
    assert beslis_goedkeuring(gewoon).actie == ACTIE_AUTO


def test_managers_mogen_containers_en_bestanden_bekijken():
    """21 nov: acht ok-vragen voor puur kijken legden de managers stil."""
    for c in ("docker ps -a --filter name=dax-northsea-01",
              "docker logs dax-northsea-01 --tail 20",
              "docker inspect -f '{{.Mounts}}' dax-northsea-01",
              "docker ps -a --filter name=companionmgr --format '{{.ID}} {{.Names}}'",
              "find /opt -type f -name '*dax-northsea-01*' 2>/dev/null | head -20",
              "docker logs axe-api --tail 200 2>&1 | grep -i error | tail -5",
              "systemctl status axe-core-api | head -20"):
        assert is_inspectie(c), c
        assert shell_auto_reden(c), c
    for c in ("docker inspect dax-northsea-01",                      # dumpt Env met sleutels
              "docker inspect -f '{{.Config.Env}}' dax-northsea-01",
              "docker restart dax-northsea-01",
              "docker exec dax-northsea-01 rm -rf /tmp",
              "find /opt -name '*.log' -delete",
              "find /opt -exec rm {} ;",
              "docker ps | sh",
              "docker ps | xargs docker rm",
              "find /opt -name x | tee /tmp/uit",
              "docker logs x > /tmp/log",
              "docker ps; docker rm x",
              "docker ps $(rm -rf /)"):
        assert not is_inspectie(c), c
