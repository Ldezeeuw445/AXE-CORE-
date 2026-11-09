"""Wereld- en luchtfeeds voor AXE Companion en Trading OS, zonder pagina die ze aanroept.

9 nov 2026: conflictEvents, energyFlows, militaryRadar, emergencyMonitor en
corporateJets stonden sinds juni-augustus stil. De intel-proxy vulde ze alleen
als een pagina hem aanriep; de draaiende versie vraagt daarbij een ingelogde
gebruiker of een Unusual Whales-token (401). Dezelfde tabellen worden hier
gevuld vanaf bronnen die geen betaald abonnement nodig hebben:

- conflictEvents  NASA EONET + USGS (geen key)            elk uur
- energyFlows     EIA (gratis key, EIA_API_KEY)            1x per dag
- militaryRadar   api.adsb.lol /v2/mil (geen key)          elk uur
- emergencyMonitor api.adsb.lol /v2/sqk/7700|7600|7500     elk uur
- corporateJets   api.adsb.lol /v2/registration/<tail>     elk uur

Niet hier, met opzet: marketTide, unusualOptions en darkPool. Die vragen echte
optie- en dark-pool-stromen; de oude Finnhub-variant van marketTide verzon de
call/put-premies (vast 2 miljard met een scheefheid erop). Liever leeg en eerlijk
dan een getal dat er echt uitziet.

Alleen lezen bij de bron. Geen orders, geen mail.
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Callable

from intel_feeds import _http_get, _laatste_sync, _log_sync

log = logging.getLogger("axe.intel_wereld")

Getter = Callable[..., tuple[int, str]]

EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?limit=15&status=open"
USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=10&orderby=time&minmagnitude=4.5"
ADSB = "https://api.adsb.lol/v2"
NOODCODES = ("7700", "7600", "7500")  # nood, radio uit, kaping
MIL_MAX = 100
ADSB_PAUZE_S = 0.25

EIA_SERIES = (
    ("PET.WCESTUS1.W", "US Crude Oil Inventories (Weekly)", "thousand barrels"),
    ("NG.NW2_EPG0_SWO_R48_BCF.W", "US Natural Gas Storage (Weekly)", "billion cubic feet"),
    ("PET.EMM_EPMR_PTE_NUS_DPG.W", "US Regular Gasoline Price", "$/gallon"),
    ("PET.RWTC.D", "WTI Crude Oil Spot Price", "$/barrel"),
    ("PET.RBRTE.D", "Brent Crude Spot Price", "$/barrel"),
)
ENERGIE_ELKE_S = 20 * 3600

MIL_CATEGORIEEN = {
    "C17": "transport", "C130": "transport", "C30J": "transport", "C5M": "transport", "A400": "transport",
    "IL76": "transport", "AN124": "transport", "C2": "transport",
    "K35R": "tanker", "KC10": "tanker", "KC30": "tanker", "A332": "tanker", "A339": "tanker", "KC46": "tanker",
    "E3": "isr", "E6B": "isr", "E4B": "isr", "RC135": "isr", "P8": "isr", "P3": "isr",
    "RQ4": "isr", "MQ9": "isr", "E8": "isr", "EP3": "isr",
    "H60": "helicopter", "EC35": "helicopter", "EC45": "helicopter", "NH90": "helicopter",
    "AH64": "helicopter", "UH60": "helicopter", "CH47": "helicopter", "V22": "helicopter",
    "F16": "fighter", "F15": "fighter", "F22": "fighter", "F35": "fighter", "F18": "fighter",
    "EF2K": "fighter", "RFAL": "fighter", "GR4": "fighter", "JAS39": "fighter",
    "B52H": "bomber", "B1B": "bomber", "B2": "bomber",
    "TWR": "ground", "G115": "trainer", "TEX2": "trainer", "BE20": "trainer",
}
_REGISTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "intel_jets_registry.json")


def _json(get: Getter, url: str, headers: dict[str, str] | None = None) -> Any:
    status, tekst = get(url, headers)
    if status != 200:
        raise RuntimeError(f"http_{status}")
    return json.loads(tekst)


def _getal(v: Any) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


# ── conflict & natuur ──────────────────────────────────────────────────────

def eonet_rijen(body: dict[str, Any]) -> list[dict[str, Any]]:
    uit = []
    for e in (body.get("events") or [])[:15]:
        cat = ((e.get("categories") or [{}])[0] or {}).get("title") or "Natural Event"
        geo = e.get("geometry") or []
        laatste = geo[-1] if geo else {}
        coords = laatste.get("coordinates") or []
        punt = len(coords) >= 2 and all(isinstance(c, (int, float)) for c in coords[:2])
        mag = laatste.get("magnitudeValue")
        uit.append({
            "event_id": str(e.get("id") or ""), "event_date": str(laatste.get("date") or "")[:10],
            "country": "Global", "region": cat, "event_type": cat,
            "sub_event_type": f"{mag} {laatste.get('magnitudeUnit') or ''}".strip() if mag is not None else "Active",
            "actor1": "", "fatalities": 0, "notes": str(e.get("title") or "")[:300],
            "latitude": coords[1] if punt else None, "longitude": coords[0] if punt else None,
        })
    return [r for r in uit if r["event_id"] and r["event_date"]]


def usgs_rijen(body: dict[str, Any]) -> list[dict[str, Any]]:
    uit = []
    for f in (body.get("features") or [])[:10]:
        p = f.get("properties") or {}
        coords = (f.get("geometry") or {}).get("coordinates") or []
        mag = _getal(p.get("mag"))
        if mag is None or not p.get("time"):
            continue
        dag = datetime.fromtimestamp(int(p["time"]) / 1000, timezone.utc).strftime("%Y-%m-%d")
        uit.append({
            "event_id": str(f.get("id") or ""), "event_date": dag, "country": "Global",
            "region": str(p.get("place") or ""), "event_type": "Earthquake", "sub_event_type": f"M{mag:.1f}",
            "actor1": "", "fatalities": 0, "notes": str(p.get("title") or f"M{mag:.1f} earthquake")[:300],
            "latitude": coords[1] if len(coords) >= 2 else None, "longitude": coords[0] if len(coords) >= 2 else None,
        })
    return uit


def haal_conflict(get: Getter) -> tuple[list[dict[str, Any]], list[str], dict[str, str]]:
    rijen, bronnen, fouten = [], [], {}
    for naam, url, maak in (("eonet", EONET_URL, eonet_rijen), ("usgs", USGS_URL, usgs_rijen)):
        try:
            r = maak(_json(get, url))
            if r:
                rijen += r
                bronnen.append(naam)
        except Exception as exc:  # noqa: BLE001
            fouten[naam] = str(exc)[:120]
    rijen.sort(key=lambda r: r["event_date"], reverse=True)
    return rijen, bronnen, fouten


# ── energie (EIA) ──────────────────────────────────────────────────────────

def eia_rijen(body: dict[str, Any], sid: str, naam: str, eenheid: str) -> list[dict[str, Any]]:
    data = (body.get("response") or {}).get("data") or body.get("data") or []
    uit = []
    for rij in data[:3]:
        if isinstance(rij, dict):
            periode, waarde = rij.get("period"), rij.get("value")
        else:
            periode, waarde = (list(rij) + [None, None])[:2]
        if not periode:
            continue
        uit.append({"series_id": sid, "series_name": naam, "period": str(periode),
                    "value": _getal(waarde), "unit": eenheid})
    return uit


def haal_energie(sleutel: str, get: Getter) -> tuple[list[dict[str, Any]], dict[str, str]]:
    rijen, fouten = [], {}
    for sid, naam, eenheid in EIA_SERIES:
        try:
            body = _json(get, f"https://api.eia.gov/v2/seriesid/{sid}?api_key={sleutel}&num=3")
            r = eia_rijen(body, sid, naam, eenheid)
            if not r:
                raise RuntimeError("leeg")
            rijen += r
        except Exception as exc:  # noqa: BLE001
            fouten[sid] = str(exc)[:80]
    return rijen, fouten


# ── lucht (adsb.lol) ───────────────────────────────────────────────────────

def mil_categorie(type_code: str) -> str:
    t = (type_code or "").upper()
    if not t or t == "?":
        return "other"
    for prefix, cat in MIL_CATEGORIEEN.items():
        if t.startswith(prefix):
            return cat
    return "other"


def _positie(a: dict[str, Any]) -> tuple[float | None, float | None]:
    lp = a.get("lastPosition") or {}
    lat = lp.get("lat") if isinstance(lp.get("lat"), (int, float)) else a.get("lat")
    lon = lp.get("lon") if isinstance(lp.get("lon"), (int, float)) else a.get("lon")
    return _getal(lat), _getal(lon)


def _hoogte(a: dict[str, Any]) -> tuple[float | None, bool]:
    alt = a.get("alt_baro")
    grond = alt == "ground" or alt == 0
    return (0.0 if grond else _getal(alt)), grond


def militaire_rijen(body: dict[str, Any], nu: datetime) -> list[dict[str, Any]]:
    uit = []
    for a in body.get("ac") or []:
        cat = mil_categorie(str(a.get("t") or ""))
        hoogte, grond = _hoogte(a)
        if cat in ("ground", "trainer") or grond or not a.get("hex"):
            continue  # zoals de proxy: alleen wat in de lucht is, geen grondstations
        lat, lon = _positie(a)
        uit.append({
            "hex": str(a["hex"]), "registration": str(a.get("r") or ""), "aircraft_type": str(a.get("t") or "?"),
            "callsign": str(a.get("flight") or "").strip(), "altitude": hoogte, "ground_speed": _getal(a.get("gs")),
            "latitude": lat, "longitude": lon, "on_ground": False, "category": cat, "last_seen": nu.isoformat(),
        })
    volgorde = {"bomber": 0, "fighter": 1, "isr": 2, "tanker": 3, "transport": 4, "helicopter": 5, "other": 6}
    uit.sort(key=lambda r: volgorde.get(r["category"], 9))
    return uit[:MIL_MAX]


def nood_rijen(body: dict[str, Any], code: str, nu: datetime) -> list[dict[str, Any]]:
    uit = []
    for a in body.get("ac") or []:
        if not a.get("hex"):
            continue
        hoogte, grond = _hoogte(a)
        lat, lon = _positie(a)
        uit.append({
            "hex": str(a["hex"]), "registration": str(a.get("r") or ""), "aircraft_type": str(a.get("t") or "?"),
            "callsign": str(a.get("flight") or "").strip(), "squawk": str(a.get("squawk") or code),
            "altitude": hoogte, "ground_speed": _getal(a.get("gs")), "latitude": lat, "longitude": lon,
            "on_ground": grond, "last_seen": nu.isoformat(),
        })
    return uit


def jet_rijen(register: list[dict[str, Any]], per_staart: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    uit = []
    for reg in register:
        a = per_staart.get(reg["tail"])
        if not a or not a.get("hex"):
            continue
        hoogte, grond = _hoogte(a)
        lat, lon = _positie(a)
        eigenaar = reg.get("owner") or ""
        if reg.get("ticker"):
            eigenaar = f"{eigenaar} ({reg['ticker']})"
        uit.append({
            "icao24": str(a["hex"]), "callsign": str(a.get("flight") or reg["tail"]).strip(),
            "company": eigenaar[:200], "origin_country": reg.get("region") or "",
            "latitude": lat, "longitude": lon, "altitude": hoogte, "velocity": _getal(a.get("gs")),
            "on_ground": grond,
        })
    return uit


def _register() -> list[dict[str, Any]]:
    with open(_REGISTER, encoding="utf-8") as f:
        return [r for r in json.load(f) if r.get("tail")]


JETS_PER_RONDE = 10


def haal_jets(get: Getter, pauze: float, nu: datetime | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Twee bulkvragen (LADD en PIA: daar staan de meeste privéjets in) en per
    ronde een klein, roterend groepje losse opvragingen. adsb.lol geeft 429 bij
    87 losse vragen achter elkaar (gemeten 9 nov); bij een 429 stopt de ronde,
    de volgende staarten komen het uur erna."""
    register = _register()
    staarten = {r["tail"].upper() for r in register}
    per_staart: dict[str, dict[str, Any]] = {}
    bulk_fouten = []
    for lijst in ("ladd", "pia"):
        try:
            for a in _json(get, f"{ADSB}/{lijst}").get("ac") or []:
                reg = str(a.get("r") or "").upper()
                if reg in staarten:
                    per_staart[reg] = a
        except Exception as exc:  # noqa: BLE001
            bulk_fouten.append(f"{lijst}:{exc}"[:60])
    begin = ((nu.hour if nu else 0) * JETS_PER_RONDE) % max(len(register), 1)
    groep = (register[begin:] + register[:begin])[:JETS_PER_RONDE]
    gevraagd, limiet = 0, False
    for reg in groep:
        if reg["tail"].upper() in per_staart:
            continue
        try:
            ac = _json(get, f"{ADSB}/registration/{reg['tail']}").get("ac") or []
            gevraagd += 1
            if ac:
                per_staart[reg["tail"].upper()] = ac[0]
        except RuntimeError as exc:
            if "429" in str(exc):
                limiet = True
                break
        if pauze:
            time.sleep(pauze)
    if limiet and not per_staart:
        # Niets gezien én afgekapt: dat is geen "0 jets in de lucht".
        raise RuntimeError(f"adsb_lol limiet (429) na {gevraagd} losse vragen; niets in beeld")
    if len(bulk_fouten) == 2 and not gevraagd:
        raise RuntimeError("adsb_lol onbereikbaar: " + "; ".join(bulk_fouten) + ("; 429" if limiet else ""))
    per_staart_tail = {r["tail"]: per_staart[r["tail"].upper()] for r in register if r["tail"].upper() in per_staart}
    return jet_rijen(register, per_staart_tail), {
        "gevolgd": len(register), "in_beeld": len(per_staart_tail), "los_gevraagd": gevraagd,
        **({"limiet": True} if limiet else {}), **({"bulk_fouten": bulk_fouten} if bulk_fouten else {}),
    }


# ── schrijven ──────────────────────────────────────────────────────────────

def _schrijf(db: Any, tabel: str, rijen: list[dict[str, Any]], nu: datetime) -> int:
    if not rijen:
        return 0
    stempel = nu.isoformat()
    db.table(tabel).insert([{**r, "snapshot_time": stempel} for r in rijen]).execute()
    return len(rijen)


def _feed(db: Any, nu: datetime, feed: str, bron: str, tabel: str, haal: Callable[[], tuple[list, Any]],
          leeg_is_ok: bool = False) -> dict[str, Any]:
    """Eén feed: ophalen, wegschrijven, eerlijk loggen. Fout = oude stand blijft oud."""
    try:
        rijen, info = haal()
        if not rijen and not leeg_is_ok:
            raise RuntimeError(f"geen rijen: {info}")
        n = _schrijf(db, tabel, rijen, nu)
        _log_sync(db, feed, bron, n, None, nu)
        return {"rijen": n, **({"info": info} if info else {})}
    except Exception as exc:  # noqa: BLE001
        _log_sync(db, feed, bron, 0, str(exc)[:300], nu)
        return {"fout": str(exc)[:200]}


def run_wereld(db: Any, nu: datetime, get: Getter = _http_get) -> dict[str, Any]:
    """Elk uur conflict/natuur; energie als de laatste ronde ouder is dan 20 uur."""
    uit: dict[str, Any] = {"job": "intel world feeds"}

    def conflict():
        rijen, bronnen, fouten = haal_conflict(get)
        return rijen, ({"bronnen": bronnen, "fouten": fouten} if fouten else None)
    uit["conflict"] = _feed(db, nu, "conflictEvents", "eonet+usgs", "intel_conflict_events", conflict)

    laatst = _laatste_sync(db, "energyFlows")
    if laatst is not None and (nu - laatst).total_seconds() < ENERGIE_ELKE_S:
        uit["energie"] = {"overgeslagen": f"laatste ronde {laatst.isoformat()}"}
        return uit
    sleutel = (os.environ.get("EIA_API_KEY") or "").strip()
    if not sleutel:
        _log_sync(db, "energyFlows", "eia", 0, "EIA_API_KEY ontbreekt op de VPS", nu)
        uit["energie"] = {"fout": "EIA_API_KEY ontbreekt op de VPS"}
        return uit
    uit["energie"] = _feed(db, nu, "energyFlows", "eia", "intel_energy_flows",
                           lambda: (lambda r, f: (r, f or None))(*haal_energie(sleutel, get)))
    return uit


def run_lucht(db: Any, nu: datetime, get: Getter = _http_get, pauze: float = ADSB_PAUZE_S) -> dict[str, Any]:
    """Elk uur: militair verkeer, noodcodes en de gevolgde zakenjets."""
    uit: dict[str, Any] = {"job": "intel air feeds"}
    uit["militair"] = _feed(db, nu, "militaryRadar", "adsb_lol", "intel_military_radar",
                            lambda: (militaire_rijen(_json(get, f"{ADSB}/mil"), nu), None))

    def nood():
        rijen, per = [], {}
        for code in NOODCODES:
            r = nood_rijen(_json(get, f"{ADSB}/sqk/{code}"), code, nu)
            per[code] = len(r)
            rijen += r
        return rijen, per
    # Nul noodgevallen is de gewone, goede uitkomst.
    uit["nood"] = _feed(db, nu, "emergencyMonitor", "adsb_lol", "intel_emergency_monitor", nood, leeg_is_ok=True)
    uit["jets"] = _feed(db, nu, "corporateJets", "adsb_lol", "intel_corporate_jets",
                        lambda: haal_jets(get, pauze, nu), leeg_is_ok=True)
    return uit


def diensten() -> tuple[dict[str, Any], ...]:
    return (
        {
            "agent": "intel-wereld", "name": "Intel feeds: conflict, nature and energy",
            "job_key": "axe_core:staande-intel-wereld", "cron_expr": "25 * * * *",
            "wat": "Fill intel_conflict_events from NASA EONET + USGS (hourly) and intel_energy_flows "
                   "from EIA (daily). Read-only at the source.",
            "run": run_wereld,
        },
        {
            "agent": "intel-lucht", "name": "Intel feeds: military, emergency squawks and corporate jets",
            "job_key": "axe_core:staande-intel-lucht", "cron_expr": "35 * * * *",
            "wat": "Fill intel_military_radar, intel_emergency_monitor and intel_corporate_jets from "
                   "api.adsb.lol (hourly). Read-only at the source.",
            "run": run_lucht,
        },
    )


__all__ = ["run_wereld", "run_lucht", "diensten"]
