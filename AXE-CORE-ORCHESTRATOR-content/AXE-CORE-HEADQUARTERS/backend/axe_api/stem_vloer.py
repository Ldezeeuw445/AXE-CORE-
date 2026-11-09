"""ADR-01 "Eén stem in de kamer": welk apparaat mag luisteren als Luka "hey AXE" zegt.

Tot 9 nov 2026 luisterde en antwoordde elk apparaat los, dus hoorde Luka de Mac
mini en de iMac tegelijk. Nu claimt elk apparaat dat het wekwoord (of de klap)
hoort, en wint er één:

1. het apparaat waar Luka de laatste 20 s typte of klikte (daar zit hij);
2. daarna het kortst stilliggende apparaat;
3. daarna de vaste volgorde (VOLGORDE, op apparaatnaam);
4. daarna wie het eerst claimde.

Wie de vloer heeft, houdt hem 12 s na zijn laatste claim; een ander apparaat
dat in die tijd claimt, verliest (zelfde grens als de stille-mic-time-out).

## Twee workers, één antwoord

uvicorn draait met --workers 2: een scheidsrechter in het geheugen ziet maar
de helft van de claims. Daarom schrijft elke claim een rij, wacht ROND_S, leest
de rijen van die ronde en rekent de winnaar uit met `kies` -- een pure functie
op dezelfde rijen, dus elke worker komt op hetzelfde uit.

## Als het misgaat

Geen tabel, geen database, te traag: het antwoord is "luister" (het gedrag van
voor ADR-01). Twee stemmen is lastig; geen stem is erger.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

ROND_S = 0.3           # hoe lang een ronde claims verzamelt
ROND_VENSTER_S = 1.5   # claims binnen dit venster rond de mijne horen bij dezelfde ronde
ACTIEF_S = 20.0        # "hier zit Luka": invoer in de laatste 20 s
VLOER_S = 12.0         # zolang houdt de winnaar het spreekrecht
VOLGORDE = ("mini", "imac", "a17", "sm-a17")


def _tijd(s: Any) -> datetime:
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    t = datetime.fromisoformat(str(s).replace("Z", "+00:00").replace(" ", "T", 1))
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _rang(naam: str) -> int:
    n = (naam or "").lower()
    for i, sleutel in enumerate(VOLGORDE):
        if sleutel in n:
            return i
    return len(VOLGORDE)


def _sleutel(c: dict[str, Any]) -> tuple:
    idle = c.get("idle_s")
    actief = idle is not None and float(idle) <= ACTIEF_S
    return (
        0 if actief else 1,
        float(idle) if idle is not None else 1e9,
        _rang(str(c.get("device_name") or c.get("device_id") or "")),
        _tijd(c["created_at"]),
        str(c.get("device_id")),
    )


def kies(mijn: dict[str, Any], rijen: list[dict[str, Any]]) -> dict[str, Any]:
    """Wie wint de ronde van `mijn`? Puur: zelfde rijen, zelfde antwoord."""
    t = _tijd(mijn["created_at"])
    ronde = [r for r in rijen if abs((_tijd(r["created_at"]) - t).total_seconds()) <= ROND_VENSTER_S]
    if not any(r.get("id") == mijn.get("id") for r in ronde):
        ronde.append(mijn)
    in_ronde = {r.get("device_id") for r in ronde}
    # Vloer: een eerdere winnaar die niet in deze ronde zit en nog binnen 12 s.
    eerder = [r for r in rijen if r.get("won") is True and r.get("device_id") not in in_ronde
              and timedelta(0) < t - _tijd(r["created_at"]) <= timedelta(seconds=VLOER_S)]
    if eerder:
        houder = max(eerder, key=lambda r: _tijd(r["created_at"]))
        return {"winner": False, "winner_device": houder.get("device_id"),
                "winner_name": houder.get("device_name"), "reden": "floor"}
    # Per apparaat alleen zijn beste claim (dubbel gehoord = één claim).
    beste: dict[str, dict[str, Any]] = {}
    for r in ronde:
        d = str(r.get("device_id"))
        if d not in beste or _sleutel(r) < _sleutel(beste[d]):
            beste[d] = r
    winnaar = min(beste.values(), key=_sleutel)
    return {"winner": winnaar.get("device_id") == mijn.get("device_id"),
            "winner_device": winnaar.get("device_id"), "winner_name": winnaar.get("device_name"),
            "reden": "active" if (winnaar.get("idle_s") is not None and float(winnaar["idle_s"]) <= ACTIEF_S)
            else "order", "devices": len(beste)}


def claim(db: Any, device_id: str, device_name: str | None, trigger: str, idle_s: float | None,
          slaap=time.sleep) -> dict[str, Any]:
    """Schrijf de claim, wacht de ronde af, beslis. Bij elke fout: luister."""
    trigger = trigger if trigger in ("wake", "clap", "button") else "wake"
    try:
        rij = (db.table("core_voice_claims").insert({
            "device_id": device_id[:120], "device_name": (device_name or "")[:120] or None,
            "trigger": trigger, "idle_s": idle_s,
        }).execute().data or [None])[0]
        if not rij:
            raise RuntimeError("geen rij terug")
        slaap(ROND_S)
        sinds = (_tijd(rij["created_at"]) - timedelta(seconds=VLOER_S + ROND_VENSTER_S)).isoformat()
        rijen = (db.table("core_voice_claims").select("id,device_id,device_name,trigger,idle_s,won,created_at")
                 .gte("created_at", sinds).order("created_at").limit(200).execute().data) or []
        besluit = kies(rij, rijen)
        try:
            db.table("core_voice_claims").update({"won": besluit["winner"]}).eq("id", rij["id"]).execute()
        except Exception:  # noqa: BLE001 -- het besluit staat al
            pass
        return besluit
    except Exception as exc:  # noqa: BLE001
        return {"winner": True, "winner_device": device_id, "reden": "fallback", "fout": str(exc)[:120]}


__all__ = ["kies", "claim", "ACTIEF_S", "VLOER_S"]
