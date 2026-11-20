from stoelen_actueel import actuele_stoelen


def r(machine, seat, t, **x):
    return {"machine": machine, "seat_id": seat, "last_seen_at": t, **x}


def test_spooknamen_vallen_weg_per_mac_de_nieuwste_naam():
    rijen = [
        r("mini-van-luka-6", "claude", "2026-11-20T20:00:00+00:00", logged_in=True),
        r("mac-mini-van-luka-5", "claude2", "2026-11-13T12:00:00+00:00", email="oud@x", logged_in=True),
        r("imac-3", "codex", "2026-11-20T20:00:00+00:00"),
        r("main-imac-luka", "codex", "2026-11-13T11:00:00+00:00"),
        r("vps", "xai", "2026-11-20T20:00:00+00:00"),
    ]
    uit = actuele_stoelen(rijen)
    assert {(x["machine"], x["seat_id"]) for x in uit} == {
        ("mini-van-luka-6", "claude"), ("imac-3", "codex"), ("vps", "xai")}


def test_mac_die_uit_staat_blijft_zichtbaar():
    uit = actuele_stoelen([r("imac-3", "codex", "2026-11-01T00:00:00+00:00")])
    assert len(uit) == 1
