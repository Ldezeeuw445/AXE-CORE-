"""De bewijs-checker zonder live database."""
from prove_core_rls import TABELLEN, anon_geweigerd, beoordeel, service_ok


def test_anon_401_is_dicht():
    assert anon_geweigerd(401, '{"message":"permission denied"}')
    assert anon_geweigerd(403, "forbidden")
    assert not anon_geweigerd(200, '[{"id":"1"}]')
    assert not anon_geweigerd(200, "[]")  # leeg = GRANT staat nog, RLS hield rijen tegen


def test_service_200():
    assert service_ok(200)
    assert not service_ok(401)


def test_beoordeel_ziet_lek_en_service(monkeypatch):
    def rest(url, tabel, key, method="GET"):
        if key == "anon":
            return 200, '[{"id":"lek"}]'
        return 200, "[]"

    monkeypatch.setattr("prove_core_rls.rest", rest)
    fouten = beoordeel("https://x.supabase.co", "anon", "service")
    assert any("LAS core_memory" in f for f in fouten)
    assert len(fouten) == len(TABELLEN)


def test_beoordeel_na_revoke(monkeypatch):
    def rest(url, tabel, key, method="GET"):
        if key == "anon":
            return 401, '{"message":"permission denied for table"}'
        return 200, "[]"

    monkeypatch.setattr("prove_core_rls.rest", rest)
    assert beoordeel("https://x.supabase.co", "anon", "service") == []
