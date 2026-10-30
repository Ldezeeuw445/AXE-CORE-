import httpx
import modelbox
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _app(monkeypatch, antwoord):
    """De route met een nep-modelbox ervoor: antwoord(request) -> httpx.Response."""
    gezien: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        gezien.append(req)
        return antwoord(req)

    echte = httpx.AsyncClient
    monkeypatch.setattr(modelbox.httpx, "AsyncClient",
                        lambda **kw: echte(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setenv("OLLAMA_HOST", "https://modelbox.test")
    app = FastAPI()
    app.include_router(modelbox.maak_router())
    return TestClient(app), gezien


def test_gebruiken_mag_beheren_niet():
    assert modelbox.mag("POST", "api/chat") and modelbox.mag("GET", "/api/tags/")
    for methode, pad in (("POST", "api/pull"), ("DELETE", "api/delete"), ("POST", "api/delete"),
                         ("POST", "api/create"), ("POST", "api/copy"), ("POST", "api/push"), ("GET", "api/chat")):
        assert not modelbox.mag(methode, pad), (methode, pad)


def test_stuurt_door_en_geeft_status_en_inhoud_terug(monkeypatch):
    monkeypatch.delenv("OLLAMA_PROXY_KEY", raising=False)
    client, gezien = _app(monkeypatch, lambda req: httpx.Response(200, json={"models": [{"name": "hermes3:8b"}]}))
    r = client.get("/ollama/api/tags")
    assert r.status_code == 200 and r.json()["models"][0]["name"] == "hermes3:8b"
    assert str(gezien[0].url) == "https://modelbox.test/api/tags"
    # Zonder OLLAMA_PROXY_KEY gaat er geen lege Bearer mee: de box laat dit IP door.
    assert "authorization" not in gezien[0].headers


def test_sleutel_van_de_server_gaat_mee_en_de_body_ook(monkeypatch):
    monkeypatch.setenv("OLLAMA_PROXY_KEY", "box-sleutel")
    client, gezien = _app(monkeypatch, lambda req: httpx.Response(200, text='{"message":{"content":"OK"}}\n'))
    r = client.post("/ollama/api/chat", json={"model": "hermes3:8b", "messages": []})
    assert r.status_code == 200 and "OK" in r.text
    assert gezien[0].headers["authorization"] == "Bearer box-sleutel"
    assert b'"hermes3:8b"' in gezien[0].content


def test_een_fout_van_de_box_blijft_een_fout(monkeypatch):
    client, _ = _app(monkeypatch, lambda req: httpx.Response(404, json={"error": "model not found"}))
    r = client.post("/ollama/api/chat", json={"model": "bestaat-niet"})
    assert r.status_code == 404 and "model not found" in r.text


def test_beheer_komt_niet_bij_de_box(monkeypatch):
    client, gezien = _app(monkeypatch, lambda req: httpx.Response(200))
    assert client.post("/ollama/api/pull", json={"name": "x"}).status_code == 403
    assert client.post("/ollama/api/delete", json={"name": "x"}).status_code == 403
    assert gezien == []
