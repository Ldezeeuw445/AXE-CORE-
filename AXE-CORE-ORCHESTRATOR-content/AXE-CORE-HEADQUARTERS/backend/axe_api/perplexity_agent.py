"""Perplexity Agent API: onderzoek met actuele bronnen, achter AUTH en een dagbudget.

## Waarom de Agent API en niet de Router

Perplexity heeft twee APIs die op elkaar lijken. De Router is een doorgeefluik
naar Claude, GPT en Gemini, en zijn eigen docs zeggen "No web grounding" -- die
modellen zoeken niet op internet. AXE had al een modellenlijst met OpenRouter
erin; een tweede router voegt daar niets nieuws aan toe.

Wat AXE miste is onderzoek dat een VRAAG beantwoordt met echte bronnen erbij.
Tavily en Exa geven zoekresultaten; EODHD en Perigon geven koppen. Geen van
allen kan je vragen "wat drijft goud deze week" en een antwoord met citaten
teruggeven. Dat doet de Agent API (`POST /v1/agent`, tool `web_search`).

## Waarom het budget HIER staat

De API wordt per aanroep afgerekend, los van een Pro-abonnement. Een grens in de
app kan elke andere client omzeilen -- de telefoon, een tweede Mac. Op de server
is het één doorgang. En elk antwoord zegt zelf wat het kostte
(`usage.cost.total_cost`), dus hier wordt niets geschat: er wordt opgeteld wat
Perplexity zelf rekende.

De tel is bewust niet waterdicht: twee vragen die tegelijk binnenkomen kunnen
allebei nog net door. Bij één gebruiker is dat hooguit één vraag te veel, en een
slot om dat te voorkomen zou elke vraag laten wachten op de vorige.

## Wat er bewust NIET in zit

De presets `xhigh` en `wide-research` draaien een sandbox en `finance_search`.
Die laatste kost apart $5 per 1.000 aanroepen en dekt alleen aandelen en ETF's --
geen goud, geen forex, geen grondstoffen. Voor wat AXE handelt is `web_search`
het nuttige gereedschap, en dat zit in `fast` tot en met `high`.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

AGENT_URL = "https://api.perplexity.ai/v1/agent"

TOEGESTANE_PRESETS = ("fast", "low", "medium", "high")
# "low" is wat de quickstart zelf aanraadt: web_search plus fetch_url, en
# lichte meerstapsvragen. "fast" kan maar één feit opzoeken; "high" is voor als
# de vraag het echt vraagt, en de aanroeper moet daar zelf om vragen.
STANDAARD_PRESET = "low"

MAX_VRAAG = 2000
# Onderzoek duurt: een "medium" loopt meerdere zoekrondes. Korter dan dit en een
# betaalde vraag breekt af nadat Perplexity het werk al gedaan heeft.
TIMEOUT_S = 120

STAAT_PAD = os.environ.get("PERPLEXITY_BUDGET_FILE", "/opt/axe-core-api/perplexity_budget.json")


def dagbudget_usd() -> float:
    """Het plafond per dag in dollars, uit de omgeving.

    Elke keer gelezen en niet bij het laden: zo verandert een aangepaste waarde
    in .env het plafond na een herstart zonder dat deze code weer open moet.
    """
    try:
        return max(0.0, float(os.environ.get("PERPLEXITY_DAILY_USD", "0.25")))
    except ValueError:
        return 0.25


def dagvragen() -> int:
    """Hoeveel vragen per dag, naast het dollarplafond.

    Luka, 14 september: $1 per dag is zo'n 200 vragen, en dat is te veel voor
    iets dat alleen het eindoordeel hoort te geven -- het zoeken zelf doen de
    gratis routes. Een dollarplafond alleen merkt dat niet op zolang elke vraag
    goedkoop is; een telling wel.
    """
    try:
        return max(0, int(os.environ.get("PERPLEXITY_DAILY_QUESTIONS", "25")))
    except ValueError:
        return 25


def _tel_sleutel(dag: str) -> str:
    return f"{dag}#vragen"


def kies_preset(gevraagd: object) -> str:
    """Een toegestane preset, of de standaard.

    Stil terugvallen in plaats van weigeren: een oudere client die een preset
    stuurt die hier niet (meer) mag, moet een goedkoper antwoord krijgen, geen
    fout. Duurder worden dan gevraagd kan zo nooit.
    """
    if isinstance(gevraagd, str) and gevraagd.strip().lower() in TOEGESTANE_PRESETS:
        return gevraagd.strip().lower()
    return STANDAARD_PRESET


def vandaag() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def tel_kosten(staat: dict, dag: str, usd: float) -> None:
    """Tel wat een vraag kostte bij de dag op. Oude dagen vallen weg."""
    for oude in [d for d in staat if not d.startswith(dag)]:
        del staat[oude]
    staat[dag] = round(staat.get(dag, 0.0) + max(0.0, usd), 6)
    staat[_tel_sleutel(dag)] = int(staat.get(_tel_sleutel(dag), 0)) + 1


def vragen_over(staat: dict, dag: str, maximum: int) -> int:
    return max(0, maximum - int(staat.get(_tel_sleutel(dag), 0)))


def budget_over(staat: dict, dag: str, plafond: float) -> float:
    """Hoeveel dollar er vandaag nog uitgegeven mag worden."""
    return max(0.0, plafond - staat.get(dag, 0.0))


def kosten_uit(antwoord: object) -> float:
    """Wat Perplexity zelf voor deze vraag rekende, of 0 als het er niet staat.

    Nul en geen fout: een antwoord zonder kostenregel is een antwoord, en het
    budget is een rem, geen boekhouding. Wie dat verschil wil zien leest het
    veld `usage.cost` in het antwoord zelf.
    """
    try:
        return float(antwoord["usage"]["cost"]["total_cost"])  # type: ignore[index]
    except (KeyError, TypeError, ValueError):
        return 0.0


def retry_after_seconden(waarde: str | None) -> int | None:
    """De wachttijd uit een Retry-After-header, als die in seconden staat."""
    if not waarde:
        return None
    try:
        return max(0, int(waarde.strip()))
    except ValueError:
        return None


def foutmelding_uit(r: httpx.Response) -> str:
    try:
        body = r.json()
    except ValueError:
        return f"Perplexity HTTP {r.status_code}"
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict) and err.get("message"):
        return str(err["message"])[:300]
    if isinstance(body, dict) and body.get("detail"):
        return str(body["detail"])[:300]
    return f"Perplexity HTTP {r.status_code}"


def lees_staat() -> dict:
    try:
        with open(STAAT_PAD, encoding="utf-8") as f:
            staat = json.load(f)
        return staat if isinstance(staat, dict) else {}
    except (OSError, ValueError):
        return {}


def schrijf_staat(staat: dict) -> None:
    """Atomair: een half geschreven bestand zou het budget morgen op nul zetten."""
    tmp = f"{STAAT_PAD}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(staat, f)
        os.replace(tmp, STAAT_PAD)
    except OSError:
        pass


router = APIRouter()


@router.get("/perplexity")
async def perplexity_stand():
    """Of de sleutel er is, zonder een vraag te stellen.

    Instellingen moet kunnen laten zien of onderzoek verbonden is. De POST
    hieronder is de enige weg die Perplexity aanroept, en die kost geld.
    """
    key = os.environ.get("PERPLEXITY_API_KEY", "")
    dag = vandaag()
    staat = lees_staat()
    plafond = dagbudget_usd()
    return {
        "configured": bool(key.strip()),
        "daily_usd": plafond,
        "daily_questions": dagvragen(),
        "usd_left": budget_over(staat, dag, plafond),
        "questions_left": vragen_over(staat, dag, dagvragen()),
    }


@router.post("/perplexity")
async def perplexity_onderzoek(body: dict = Body(...)):
    key = os.environ.get("PERPLEXITY_API_KEY", "")
    if not key:
        return JSONResponse(status_code=503, content={
            "detail": "Perplexity not configured (set PERPLEXITY_API_KEY on the server).",
        })

    vraag = (body.get("question") or "").strip() if isinstance(body.get("question"), str) else ""
    if not vraag:
        return JSONResponse(status_code=400, content={"detail": "Missing question"})

    dag = vandaag()
    staat = lees_staat()
    plafond = dagbudget_usd()
    if vragen_over(staat, dag, dagvragen()) <= 0:
        return JSONResponse(status_code=402, content={
            "detail": f"Daily Perplexity budget of {dagvragen()} questions is spent. Resets at 00:00 UTC.",
        })
    if budget_over(staat, dag, plafond) <= 0:
        # 402 en geen 429: dit gaat niet over wachten maar over geld. Een
        # client die 429 ziet probeert het straks opnieuw; dat hoort hier niet.
        return JSONResponse(status_code=402, content={
            "detail": f"Daily Perplexity budget of ${plafond:.2f} is spent. Resets at 00:00 UTC.",
        })

    payload: dict = {"input": vraag[:MAX_VRAAG], "preset": kies_preset(body.get("preset"))}
    instructies = body.get("instructions")
    if isinstance(instructies, str) and instructies.strip():
        payload["instructions"] = instructies.strip()[:MAX_VRAAG]

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            r = await client.post(
                AGENT_URL,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.HTTPError as e:
        return JSONResponse(status_code=502, content={"detail": f"Perplexity unreachable: {str(e)[:200]}"})

    if r.status_code == 429:
        # Overbelast. De docs: opnieuw proberen na Retry-After is veilig, want
        # een vraag die faalt voor er uitvoer is, wordt niet afgerekend.
        wacht = retry_after_seconden(r.headers.get("Retry-After"))
        return JSONResponse(
            status_code=429,
            content={"detail": foutmelding_uit(r), "retryAfter": wacht},
            headers={"Retry-After": str(wacht)} if wacht is not None else None,
        )
    if r.status_code in (401, 403):
        # Niet als 401 doorgeven: die code gebruikt de eigen AUTH van deze
        # server ook, en dan denkt de app dat ZIJN sleutel fout is.
        return JSONResponse(status_code=502, content={
            "detail": f"Perplexity rejected the server key ({r.status_code}). Rotate PERPLEXITY_API_KEY in the console.",
        })
    if r.is_error:
        status = r.status_code if 400 <= r.status_code < 500 else 502
        return JSONResponse(status_code=status, content={"detail": foutmelding_uit(r)})

    try:
        antwoord = r.json()
    except ValueError:
        return JSONResponse(status_code=502, content={"detail": "Perplexity returned no JSON"})

    tel_kosten(staat, dag, kosten_uit(antwoord))
    schrijf_staat(staat)
    return antwoord
