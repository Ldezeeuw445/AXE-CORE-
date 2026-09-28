"""Elke agent zijn eigen rol: AGENT_BRIEFS gelijk aan de roster van de app.

Tot nu toe kreeg het model altijd dezelfde system prompt, dus "NorthSea Desk
Manager" en "Trading Agent" waren twee etiketten op precies dezelfde lus. Deze
tests bewaken de drie dingen die dat echt maken: elke roster-id heeft een brief,
de brief staat vóór de system prompt, en de veiligheid eronder blijft staan --
NorthSea leest alleen, en een order gaat nooit zonder Luka.
"""
import asyncio
import re
from pathlib import Path

import pytest

import agent_loop

ROSTER = (Path(__file__).resolve().parents[2] / "src/domain/agents/roster.ts").read_text()


def _ids_uit_het_type() -> set[str]:
    """De AxeAgentId-unie: | 'axe' | 'wingman' | ..."""
    blok = ROSTER.split("export type AxeAgentId =", 1)[1].split(";", 1)[0]
    return set(re.findall(r"'([a-z]+)'", blok))


def _ids_uit_de_lijst() -> set[str]:
    """De id-velden van AXE_AGENTS zelf."""
    blok = ROSTER.split("export const AXE_AGENTS", 1)[1].split("] as const;", 1)[0]
    return set(re.findall(r"^\s*id: '([a-z]+)',", blok, re.M))


def test_elke_agent_uit_de_app_heeft_een_brief():
    uit_type = _ids_uit_het_type()
    assert uit_type == _ids_uit_de_lijst(), "roster.ts spreekt zichzelf tegen"
    assert uit_type, "geen enkele id uit roster.ts gelezen"
    assert uit_type == set(agent_loop.AGENT_BRIEFS)
    # Een lege of nietszeggende brief telt niet als rol.
    for id_, brief in agent_loop.AGENT_BRIEFS.items():
        assert len(brief) > 60, id_


class _Vangst:
    """Vervangt _call_model: legt de system prompt vast en laat de lus stoppen.

    Geeft een run_shell terug die hoe dan ook goedkeuring vraagt, zodat de lus
    na één stap eindigt zonder echt iets uit te voeren.
    """

    def __init__(self, command: str):
        self.command = command
        self.prompt: str | None = None

    async def __call__(self, contents, api_key):
        self.prompt = agent_loop._to_openai_messages(contents)[0]["content"]
        return {"parts": [{"functionCall": {
            "name": "run_shell", "args": {"command": self.command},
        }}]}


@pytest.fixture(autouse=True)
def geen_echte_shell(monkeypatch):
    """Nooit een echt commando uitvoeren.

    Deze tests bewijzen dat een order-commando gestopt wordt. Draaide de test
    hem alsnog als de bewaking wegvalt, dan zou het terugdraaien van de fix op
    de VPS een echte curl naar de broker sturen -- precies wat hier voorkomen
    moet worden.
    """
    monkeypatch.setattr(
        agent_loop, "_shell",
        lambda *a, **k: {"exit_code": 0, "stdout": "", "stderr": ""},
    )


async def _stil(*_a):
    pass


def _draai(vangst, **kw):
    return asyncio.run(agent_loop.run_agent_loop("doe iets", "t1", _stil, **kw))


def test_brief_van_northsea_staat_voor_de_system_prompt(monkeypatch):
    vangst = _Vangst("systemctl restart axe-core-api")
    monkeypatch.setattr(agent_loop, "_call_model", vangst)

    with pytest.raises(agent_loop.ApprovalRequired):
        _draai(vangst, agent="northsea")

    prompt = vangst.prompt
    assert "NorthSea Desk Manager" in prompt
    assert "READ-ONLY" in prompt
    # Brief eerst, basisprompt daarna.
    assert prompt.index("NorthSea Desk Manager") < prompt.index("You are AXE, operating")
    assert prompt.endswith(agent_loop.SYSTEM_PROMPT)


def test_zonder_agent_blijft_de_prompt_ongewijzigd(monkeypatch):
    vangst = _Vangst("systemctl restart axe-core-api")
    monkeypatch.setattr(agent_loop, "_call_model", vangst)

    with pytest.raises(agent_loop.ApprovalRequired):
        _draai(vangst)

    assert vangst.prompt == agent_loop.SYSTEM_PROMPT
    # En de ContextVar is weer leeg, ook na een uitzondering.
    assert agent_loop.systeem_prompt() == agent_loop.SYSTEM_PROMPT


def test_northsea_leest_alleen_wat_de_aanroeper_ook_zegt(monkeypatch):
    # read_only wordt NIET meegegeven; de desk hoort hem zelf af te dwingen.
    vangst = _Vangst("echo hallo > /opt/axe-workspace/offerte.txt")
    monkeypatch.setattr(agent_loop, "_call_model", vangst)

    with pytest.raises(agent_loop.ApprovalRequired) as e:
        _draai(vangst, agent="northsea")
    assert "read-only" in e.value.reason


def test_order_plaatsen_loopt_tegen_goedkeuring(monkeypatch):
    vangst = _Vangst(
        "curl -X POST https://mt-client-api-v1.london.agiliumtrade.ai"
        "/users/current/accounts/abc/trade -d '{\"actionType\":\"ORDER_TYPE_BUY\"}'"
    )
    monkeypatch.setattr(agent_loop, "_call_model", vangst)

    with pytest.raises(agent_loop.ApprovalRequired) as e:
        _draai(vangst, agent="trading")
    assert "order" in e.value.reason


def test_elke_order_ingang_vraagt_ok():
    r = lambda c: agent_loop.approval_reason(c, None)
    # Plaatsen, in de app en op deze box.
    assert r("node -e \"brokerPlaceOrder({symbol:'XAUUSD'})\"")
    assert r("python3 -c 'place_order(\"US30\", 1)'")
    assert r("curl -s -X POST http://127.0.0.1:8000/trading/order")
    assert r("node scripts/metaApiMarketOrder.js")
    # Wijzigen en annuleren zijn net zo goed geld.
    assert r("curl -d '{\"actionType\":\"POSITION_MODIFY\"}' https://example.com")
    assert r("curl -d '{\"actionType\":\"ORDER_CANCEL\"}' https://example.com")
    # Kijken naar de trading-stack blijft vrij.
    assert r("ls /opt/axe-trading/venv/bin") is None
    assert r("cat /opt/axe-workspace/trades.csv | tail -5") is None
