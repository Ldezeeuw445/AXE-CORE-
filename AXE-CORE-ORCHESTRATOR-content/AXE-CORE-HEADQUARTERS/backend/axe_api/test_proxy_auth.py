"""De proxies staan achter AUTH, en de planner stuurt zijn Bearer mee.

Gemeten 14 september 2026: POST /proxy/ai met '{}' gaf 400 van buitenaf,
voorbij elke authcontrole, terwijl de route met _SERVER_KEYS op Luka's kosten
OpenAI en Anthropic aanroept. main.py importeren vraagt Supabase en een hele
omgeving, dus dit leest de decorators uit de broncode: een route die AUTH
kwijtraakt, laat deze test falen.
"""
import ast
import pathlib

import planner as p

MAIN = pathlib.Path(__file__).with_name("main.py")
BEWAAKT = {"/proxy/ai", "/proxy/ai/providers", "/proxy/exa", "/proxy/fish-tts", "/tts", "/tts/health"}


def _routes_met_auth() -> dict[str, bool]:
    uit: dict[str, bool] = {}
    for node in ast.walk(ast.parse(MAIN.read_text())):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)
                    and dec.args and isinstance(dec.args[0], ast.Constant)):
                continue
            pad = dec.args[0].value
            auth = any(
                kw.arg == "dependencies" and "AUTH" in ast.unparse(kw.value)
                for kw in dec.keywords
            )
            uit[pad] = auth
    return uit


def test_elke_betaalde_proxy_eist_auth():
    routes = _routes_met_auth()
    assert BEWAAKT <= routes.keys(), f"route verdwenen: {BEWAAKT - routes.keys()}"
    open_ = sorted(r for r in BEWAAKT if not routes[r])
    assert open_ == [], f"open zonder AUTH: {open_}"


def test_planner_stuurt_de_serversleutel_mee(monkeypatch):
    monkeypatch.delenv("AXE_PLANNER_PROXY_KEY", raising=False)
    monkeypatch.setenv("AXE_API_KEY", "test-sleutel")
    assert p._proxy_headers() == {"Authorization": "Bearer test-sleutel"}


def test_planner_eigen_sleutel_wint_en_zonder_sleutel_geen_lege_header(monkeypatch):
    monkeypatch.setenv("AXE_API_KEY", "server")
    monkeypatch.setenv("AXE_PLANNER_PROXY_KEY", "ander")
    assert p._proxy_headers() == {"Authorization": "Bearer ander"}
    monkeypatch.delenv("AXE_PLANNER_PROXY_KEY")
    monkeypatch.delenv("AXE_API_KEY")
    assert p._proxy_headers() == {}


def test_sleutels_route_gebruikt_de_headers(monkeypatch):
    monkeypatch.setenv("AXE_API_KEY", "test-sleutel")
    gezien = {}

    class Antwoord:
        status_code = 200
        text = ""
        def json(self):
            return {"text": "ok"}

    def nep_post(url, **kw):
        gezien.update(kw)
        return Antwoord()

    import httpx
    monkeypatch.setattr(httpx, "post", nep_post)
    planner = p.Planner(lambda: None, lambda **k: {}, lambda: {})
    assert planner._sleutels("hoi") == ("ok", "")
    assert gezien["headers"] == {"Authorization": "Bearer test-sleutel"}
