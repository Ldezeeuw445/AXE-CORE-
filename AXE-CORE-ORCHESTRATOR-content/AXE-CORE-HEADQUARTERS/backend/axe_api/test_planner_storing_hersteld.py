"""24 nov: een Fix-taak sluit als zijn bron niet meer kapot is; 'skipped' is geen storing."""
import planner as p


def _fix(tid, bron, status="pending", oorsprong="storing"):
    return {"id": tid, "status": status, "metadata": {"oorsprong": oorsprong, "bron_id": bron}}


def test_fix_taak_sluit_als_bron_weer_goed_is():
    open_taken = [
        _fix("a", "cef87d45"),                       # bron klaar sinds 21 nov
        _fix("b", "axe_core:planner"),               # bron nog kapot
        _fix("c", "weg", status="running"),          # loopt: maakt zichzelf af
        _fix("d", "x", oorsprong="vervolg"),         # geen storing-taak
        {"id": "e", "status": "pending", "metadata": {"oorsprong": "storing"}},  # geen bron
    ]
    kapot = [{"id": "axe_core:planner", "last_status": "fail"}]
    assert p.storing_taken_te_sluiten(open_taken, kapot) == ["a"]


def test_skipped_is_geen_storing():
    assert not p.is_echte_storing({"last_status": "skipped"})
    assert p.is_echte_storing({"last_status": "fail"})
    assert p.is_echte_storing({"last_status": "waiting_approval"})


class _Leesfout:
    def table(self, *_):
        raise RuntimeError("netwerk weg")


def test_niets_sluiten_als_storingen_niet_gelezen_konden_worden():
    pl = p.Planner.__new__(p.Planner)
    pl.sb = lambda: _Leesfout()
    assert pl._echte_storingen() == []
    assert pl._storingen_compleet is False
    pl._open_taken = lambda agent: [_fix("a", "cef87d45")]
    assert pl._sluit_herstelde_storingen([]) == 0
