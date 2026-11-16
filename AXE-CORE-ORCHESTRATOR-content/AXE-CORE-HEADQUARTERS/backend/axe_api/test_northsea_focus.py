"""NorthSea-focus: de drie deals die het dichtst bij een deal zijn, niet de wachtrijteller."""
from datetime import datetime, timezone

import northsea_focus as nf

NU = datetime(2026, 11, 16, 13, 0, tzinfo=timezone.utc)


def deal(code, poorten=0, gereed=None, contact=0, fase="identified", owner="axe", blokkade=None, volgende=None):
    return {"deal": {"deal_id": code, "deal_code": code, "stage": fase, "product": "Copper Cathode", "volume_mt": 100,
                     "readiness_score": gereed, "primary_blocker": blokkade, "next_action": volgende, "action_owner": owner,
                     "buyer": {"name": "Koper"}, "supplier": {"name": "Verkoper"}},
            "gates": [{"passed": i < poorten} for i in range(9)], "communications_total": contact,
            "recent_events": [{"event_type": "engine_evaluation_changed",
                               "summary": "Current blocker: Commission not signed. Next: Luka: sign the fee agreement."}]}


def test_kiest_wie_het_verst_is_en_zegt_waar_hij_vastzit():
    deals = [deal("PAPIER"), deal("DEAL-002", poorten=2, gereed=55, contact=12, fase="engaged", owner="luka"),
             deal("DEAL-001", poorten=1, contact=3), deal("WEG", poorten=5, fase="lost")]
    top = nf.kies(deals)
    assert [d["deal"]["deal_code"] for d in top] == ["DEAL-002", "DEAL-001", "PAPIER"]
    titel, detail = nf.regel(top[0])
    assert titel.startswith("Dichtst bij een deal: DEAL-002, Copper Cathode 100 MT (Verkoper → Koper)")
    assert "2 van 9 stappen rond" in detail and "vast op: Commission not signed" in detail
    assert "volgende stap (jij): Luka: sign the fee agreement." in detail


def test_leest_hooguit_eens_per_twee_uur():
    nf._cache.update(op=None, uit=[])
    gelezen = []

    async def ophaler(actie, params):
        gelezen.append(actie)
        if actie == "get_pipeline_summary":
            return {"result": {"metrics": [{"metric": "active", "record_ids": ["a", "b"]}]}}
        return {"result": deal(params["deal"], poorten=1)}

    eerste = nf.focus(NU, ophaler)
    assert len(eerste) == 2 and gelezen.count("get_deal") == 2
    assert nf.focus(NU, ophaler) == eerste and gelezen.count("get_deal") == 2
    nf._cache.update(op=None, uit=[])
