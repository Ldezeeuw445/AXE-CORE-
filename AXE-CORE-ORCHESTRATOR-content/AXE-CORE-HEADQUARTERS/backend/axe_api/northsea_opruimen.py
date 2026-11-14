"""De NorthSea Manager ruimt de desk op en legt de rest aan Luka voor.

Luka, 10 nov 2026, gekozen niveau "opruimen + voorstellen":
- één keer per dag (na 08:00 Amsterdam) ruimt hij op wat zeker kan
  (northsea_tidy_desk apply=["auto"]) en zet hij de voorstellen (V1, V2, ...)
  in gewone zinnen in het gesprek;
- "ok V1" in de chat voert dat voorstel uit (POST /northsea/opruimen).

Nooit versturen, goedkeuren, prijzen of voorwaarden accepteren: dat kan de tool
zelf niet (northsea_mcp/opruimen.py), en hier wordt hij niet anders aangeroepen.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

Ophaler = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]

_MARKER = os.path.join(tempfile.gettempdir(), "axe_northsea_opruimen.json")
AGENT = "northseamgr"


TIDY_URL = os.environ.get("NORTHSEA_TIDY_URL", "http://127.0.0.1:8040/internal/desk/tidy")


async def _intern(actie: str, params: dict[str, Any]) -> dict[str, Any]:
    """Via de interne route met de engine-sleutel (14 nov): AXE's gateway-sleutel
    heeft alleen leesrecht, de engine-sleutel schrijft al in deze tabellen."""
    import httpx
    token = os.environ.get("NORTHSEA_ENGINE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("NORTHSEA_ENGINE_TOKEN ontbreekt op deze host")
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(TIDY_URL, json={"dry_run": params.get("dry_run", True), "apply": params.get("apply") or []},
                         headers={"Authorization": f"Bearer {token}"})
    if r.status_code >= 400:
        raise RuntimeError(f"northsea desk tidy {r.status_code}: {r.text[:160]}")
    return r.json()


def _ophaler(ophaler: Ophaler | None) -> Ophaler:
    return ophaler if ophaler is not None else _intern


def codes_uit(tekst: str) -> list[str]:
    """'ok V1', 'ok v1 en v3', 'ja V2', 'ok alles' -> ['V1'] / ['V1','V3'] / ['V2'] / ['ALLES']."""
    t = (tekst or "").strip().lower()
    if not re.match(r"^(ok|oke|oké|okay|ja|yes|doe maar|akkoord)\b", t):
        return []
    if re.search(r"\b(alles|allemaal|all)\b", t):
        return ["ALLES"]
    return sorted({f"V{n}" for n in re.findall(r"\bv\s*(\d{1,2})\b", t)}, key=lambda c: int(c[1:]))


def _regel(item: dict[str, Any]) -> str:
    return str(item.get("label") or item.get("id"))


def bericht_na_opruimen(resultaat: dict[str, Any], plan: dict[str, Any]) -> str:
    """Gewone taal: wat ik deed, wat ik voorstel, en hoe Luka ja zegt."""
    delen: list[str] = []
    gedaan = resultaat.get("applied") or []
    if gedaan:
        regels = "\n".join(f"- {_regel(g)}" for g in gedaan[:8])
        meer = f"\n- en nog {len(gedaan) - 8}" if len(gedaan) > 8 else ""
        delen.append(f"Opgeruimd ({len(gedaan)}):\n{regels}{meer}")
    voorstellen = plan.get("proposals") or []
    if voorstellen:
        blokken = []
        for v in voorstellen:
            voorbeelden = ", ".join(_regel(i) for i in (v.get("items") or [])[:3])
            blokken.append(f"- {v['code']}: {v['title']}. {v['why']}" + (f" Bijvoorbeeld: {voorbeelden}." if voorbeelden else ""))
        delen.append("Mijn voorstellen (zeg \"ok V1\", \"ok V1 en V3\" of \"ok alles\"):\n" + "\n".join(blokken))
    if not delen:
        return ""
    delen.append("Versturen, goedkeuren en DEAL-002 blijven bij jou in de desk; daar kom ik niet aan.")
    return "\n\n".join(delen)


async def _tidy(ophaler: Ophaler, *, dry_run: bool, apply: list[str]) -> dict[str, Any]:
    return await ophaler("tidy_desk", {"idempotency_key": f"axe-{uuid.uuid4()}", "dry_run": dry_run, "apply": apply})


def _vandaag_al(nu: datetime) -> bool:
    try:
        with open(_MARKER, encoding="utf-8") as f:
            return json.load(f).get("dag") == nu.date().isoformat()
    except Exception:  # noqa: BLE001
        return False


def _zet_marker(nu: datetime) -> None:
    try:
        with open(_MARKER, "w", encoding="utf-8") as f:
            json.dump({"dag": nu.date().isoformat()}, f)
    except Exception:  # noqa: BLE001
        pass


def dagelijks(db: Any, nu: datetime, ophaler: Ophaler | None = None) -> dict[str, Any]:
    """Eén keer per dag: automatisch opruimen en de voorstellen in de chat."""
    if _vandaag_al(nu):
        return {"overgeslagen": "vandaag al gedaan"}
    o = _ophaler(ophaler)

    async def ronde():
        gedaan = await _tidy(o, dry_run=False, apply=["auto"])
        plan = await _tidy(o, dry_run=True, apply=[])
        return gedaan, plan

    try:
        gedaan, plan = asyncio.run(ronde())
    except Exception as exc:
        # Geen schrijfrecht is geen storing die over een kwartier weg is: dan
        # vandaag niet nog 40 keer proberen (14 nov: elk kwartier dezelfde fout).
        if "insufficient_scope" in str(exc):
            _zet_marker(nu)
        raise
    _zet_marker(nu)
    tekst = bericht_na_opruimen(gedaan, plan)
    import manager_draad
    verteld = manager_draad.vertel_luka(db, AGENT, tekst) if tekst else False
    return {"opgeruimd": len(gedaan.get("applied") or []), "voorstellen": [v["code"] for v in plan.get("proposals") or []],
            "verteld": verteld}


def voer_uit(db: Any, codes: list[str], ophaler: Ophaler | None = None) -> dict[str, Any]:
    """Luka zei "ok V1": precies die voorstellen uitvoeren en het in de chat zeggen."""
    o = _ophaler(ophaler)

    async def ronde():
        plan = await _tidy(o, dry_run=True, apply=[])
        alle = [v["code"] for v in plan.get("proposals") or []]
        kies = alle if "ALLES" in codes else [c for c in codes if c in alle]
        if not kies:
            return plan, None, []
        return plan, await _tidy(o, dry_run=False, apply=kies), kies

    plan, resultaat, kies = asyncio.run(ronde())
    import manager_draad
    if not kies:
        bekend = ", ".join(v["code"] for v in plan.get("proposals") or []) or "geen"
        tekst = f"Dat voorstel ken ik niet (meer). Open voorstellen nu: {bekend}."
    else:
        gedaan = resultaat.get("applied") or []
        over = resultaat.get("skipped") or []
        tekst = (f"Gedaan: {', '.join(kies)}. {len(gedaan)} weggezet"
                 + (f", {len(over)} lukte niet (stond al anders)" if over else "")
                 + ". Alles staat met de vorige stand in het logboek, dus het is terug te draaien.")
    manager_draad.schrijf(db, AGENT, "assistant", tekst)
    return {"uitgevoerd": kies, "tekst": tekst}


__all__ = ["dagelijks", "voer_uit", "codes_uit", "bericht_na_opruimen"]
