import asyncio

import pytest

import agent_loop


def test_na_een_fout_een_kwartier_overslaan(monkeypatch):
    agent_loop._ollama_vol_tot = 0.0
    async def kapot(_):
        raise RuntimeError("timeout")
    monkeypatch.setattr(agent_loop, "_call_ollama", kapot)
    with pytest.raises(RuntimeError, match="timeout"):
        asyncio.run(agent_loop._call_ollama_begrensd([]))
    assert agent_loop.ollama_overslaan()
    geroepen = []
    async def telt(_):
        geroepen.append(1)
        return {"parts": [{"text": "ok"}]}
    monkeypatch.setattr(agent_loop, "_call_ollama", telt)
    with pytest.raises(RuntimeError, match="skipped"):
        asyncio.run(agent_loop._call_ollama_begrensd([]))
    assert geroepen == []
    agent_loop._ollama_vol_tot = 0.0


def test_pauze_loopt_af():
    agent_loop._ollama_pauzeer(nu=1000.0)
    assert agent_loop.ollama_overslaan(nu=1000.0 + 60)
    assert not agent_loop.ollama_overslaan(nu=1000.0 + agent_loop.OLLAMA_PAUZE_S + 1)
    agent_loop._ollama_vol_tot = 0.0
