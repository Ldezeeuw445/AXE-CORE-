"""Cron-notices worden zichtbare taken; auto_send blijft uit."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from northsea_crew_zichtbaar import (
    berichten_uit_cron,
    core_task_rij,
    schrijf_zichtbaar,
)


class _Tabel:
    def __init__(self, naam, db):
        self.naam = naam
        self.db = db

    def insert(self, rij):
        self.db.setdefault(self.naam, []).append(rij)
        return self

    def execute(self):
        return type("R", (), {"data": [self.db[self.naam][-1]]})()


class _Db:
    def __init__(self):
        self.rijen = {}

    def table(self, naam):
        return _Tabel(naam, self.rijen)


def test_ja_vraag_heeft_deal_kanten_commissie_en_wacht_op_goedkeuring():
    data = {
        "notices": [{
            "soort": "ja",
            "titel": "Yes needed: DEAL-001 — Copper Cathode",
            "tekst": (
                "Deal: DEAL-001 — Copper Cathode (500 MT)\n"
                "Buyer: Qinzhou Harbour Metals Ltd (China)\n"
                "Seller: Mopani Copper Mines PLC (Zambia)\n"
                "Commission: not recorded — status not_started\n"
                "What yes does: Yes starts commission protection for this deal."
            ),
            "akkoord_nodig": True,
            "deal_code": "DEAL-001",
            "buyer": "Qinzhou Harbour Metals Ltd",
            "seller": "Mopani Copper Mines PLC",
            "commission": {"status": "not_started"},
        }],
        "sent": 0,
    }
    berichten = berichten_uit_cron("operations_sweep", data)
    assert len(berichten) == 1
    assert berichten[0]["akkoord_nodig"] is True
    assert "What yes does:" in berichten[0]["tekst"]
    assert "Buyer:" in berichten[0]["tekst"] and "Seller:" in berichten[0]["tekst"]
    rij = core_task_rij(berichten[0])
    assert rij["status"] == "waiting_approval"
    assert rij["assignee"] == "northsea"
    assert rij["metadata"]["agent"] == "northsea"
    assert rij["metadata"]["source"] == "cron"
    assert rij["requested_by"] == "luka"


def test_lege_discovery_verdwijnt_niet_en_vraagt_geen_jacht():
    data = {"created": 0, "considered_pairs": 1554, "sent": 0}
    berichten = berichten_uit_cron("discovery_sweep", data)
    assert berichten
    assert berichten[0]["akkoord_nodig"] is False
    assert "1554" in berichten[0]["tekst"]
    assert "What yes does: nothing" in berichten[0]["tekst"]
    rij = core_task_rij(berichten[0])
    assert rij["status"] == "pending"
    assert rij["status"] != "waiting_approval"


def test_schrijf_zichtbaar_zet_taken_en_geheugen():
    db = _Db()
    uit = schrijf_zichtbaar(db, "engine_tick", {"plan": {"followups": []}, "sent": 0})
    assert uit["taken"] >= 1 and uit["geheugen"] == 1
    assert db.rijen["core_tasks"][0]["assignee"] == "northsea"
    assert db.rijen["rag_memories"][0]["category"] == "northsea_desk"
    assert "auto_send" not in str(db.rijen).lower()
