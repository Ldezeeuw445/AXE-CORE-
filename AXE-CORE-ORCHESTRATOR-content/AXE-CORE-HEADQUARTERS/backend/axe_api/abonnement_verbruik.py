"""Hoeveel elk abonnement nog kan: per account, per sessie en per week.

Luka, 11 okt 2026: "alle subscriptions inloggen en zien hoeveel ik nog kan
gebruiken per account, subscription en sessie, zoals elk account het laat zien."

Dezelfde bronnen die de CLI's zelf gebruiken, niets geschat:

- Claude: /api/oauth/usage met het OAuth-token van dat account (macOS-sleutelhanger,
  per CLAUDE_CONFIG_DIR een eigen item: "Claude Code-credentials-<sha256(map)[:8]>";
  op Linux .credentials.json). Geeft five_hour (de sessie) en seven_day.
- Codex: chatgpt.com/backend-api/wham/usage met het token uit auth.json; precies
  wat `codex /status` toont (primary = 5 u, secondary = week).
- Cursor: `cursor-agent about` geeft het plan en het account. Een verbruikscijfer
  geeft Cursor alleen op cursor.com/dashboard; dat zeggen we dan ook.

Tokens verlaten deze module nooit: ze gaan alleen als header naar de aanbieder
van dat token, en niets ervan komt in het antwoord of in een log.

We verversen een verlopen token NIET zelf: de refresh-token roteert, en een
tweede schrijver naast de CLI kan het account kapot maken. De CLI ververst bij
zijn volgende run; tot dan zegt het scherm dat eerlijk.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable, Optional

log = logging.getLogger("axe_core_api.verbruik")

CACHE_S = 120.0
_cache: dict[str, tuple[float, dict]] = {}

CLAUDE_URL = "https://api.anthropic.com/api/oauth/usage"
CODEX_URL = "https://chatgpt.com/backend-api/wham/usage"


# ── Puur: antwoorden van de aanbieders naar één vorm ─────────────────────────

def _venster(procent: Any, reset: Any) -> Optional[dict]:
    if procent is None:
        return None
    try:
        p = max(0.0, min(100.0, float(procent)))
    except (TypeError, ValueError):
        return None
    if isinstance(reset, (int, float)):
        reset = datetime.fromtimestamp(reset, tz=timezone.utc).isoformat()
    return {"procent": round(p, 1), "reset": reset or None}


def vertaal_claude(body: dict) -> dict:
    """five_hour = de sessie, seven_day = de week (plus een apart Opus-/Sonnet-weekvenster als dat er is)."""
    uit: dict[str, Any] = {}
    for sleutel, naam in (("five_hour", "sessie"), ("seven_day", "week"),
                          ("seven_day_opus", "week_opus"), ("seven_day_sonnet", "week_sonnet")):
        v = body.get(sleutel) or {}
        venster = _venster(v.get("utilization"), v.get("resets_at"))
        if venster:
            uit[naam] = venster
    extra = body.get("extra_usage") or {}
    if extra.get("is_enabled"):
        uit["extra"] = {"aan": True, "procent": extra.get("utilization")}
    return uit


def vertaal_codex(body: dict) -> dict:
    rl = body.get("rate_limit") or {}
    uit: dict[str, Any] = {"plan": body.get("plan_type")}
    s = rl.get("primary_window") or {}
    w = rl.get("secondary_window") or {}
    if _venster(s.get("used_percent"), s.get("reset_at")):
        uit["sessie"] = _venster(s.get("used_percent"), s.get("reset_at"))
    if _venster(w.get("used_percent"), w.get("reset_at")):
        uit["week"] = _venster(w.get("used_percent"), w.get("reset_at"))
    if rl.get("limit_reached"):
        uit["limiet_bereikt"] = True
    return uit


def status_uit_fout(code: int, tekst: str) -> tuple[str, str]:
    """(status, reden) uit een HTTP-fout van de aanbieder. Status: expired | blocked | error."""
    t = tekst.lower()
    if "not allowed for this organization" in t or "disabled claude subscription" in t:
        return "blocked", "The organisation of this account has switched off subscription access for Claude Code."
    if code in (401, 403) and ("expired" in t or "token_expired" in t):
        return "expired", "Token expired. It refreshes on the next run of this account; if that fails, log in again."
    if code == 401:
        return "expired", "Not signed in (the provider refused the token). Log in again."
    if code == 429:
        return "error", "The provider is rate limiting the usage check; try again in a minute."
    return "error", f"Usage check failed (HTTP {code})."


WARM_GELDIG_S = 26 * 3600


def stand_na_verlopen_token(plan: Any, warm: Optional[dict], nu: Optional[datetime] = None) -> dict:
    """Wat een kaart zegt als het toegangstoken van een Claude-stoel verlopen is.

    Dat token leeft een paar uur en de CLI ververst het bij zijn volgende run;
    een stoel die een dag niets deed staat dus altijd op verlopen. Op 20 okt
    stonden drie van de vier zo op "Limit seen · Token expired" terwijl ze
    ingelogd waren. De planner doet sindsdien een dagelijkse check-in
    (agent_runner.houd_warm): slaagde die, dan is de stoel gewoon Idle. Faalde
    hij, dan is het een echte waarschuwing, met de fout die de CLI gaf.
    """
    nu = nu or datetime.now()
    try:
        leeftijd = (nu - datetime.fromisoformat(str((warm or {}).get("at")))).total_seconds()
    except ValueError:
        leeftijd = None
    if warm and warm.get("ok") is False:
        return {"status": "expired", "plan": plan,
                "reden": f"The daily check-in failed: {str(warm.get('fout') or 'unknown error')[:160]}. Log in again."}
    if leeftijd is not None and leeftijd < WARM_GELDIG_S:
        uur = max(0, int(leeftijd // 3600))
        return {"status": "idle", "plan": plan,
                "reden": f"Idle. Checked in {uur}h ago; the session renews on the next run."}
    return {"status": "idle", "plan": plan,
            "reden": "Idle. The session renews on the next run; the planner checks in once a day."}


def lees_cursor_about(tekst: str) -> dict:
    """Plan en e-mail uit `cursor-agent about`."""
    plan = re.search(r"Subscription Tier\s+(.+)", tekst)
    mail = re.search(r"User Email\s+(\S+@\S+)", tekst)
    return {"plan": plan.group(1).strip() if plan else None, "account": mail.group(1).strip() if mail else None}


def jwt_claims(jwt: str) -> dict:
    try:
        deel = jwt.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(deel + "=" * (-len(deel) % 4)))
    except (IndexError, ValueError):
        return {}


# ── Tokens lezen (blijven in deze module) ────────────────────────────────────

def claude_sleutelhanger_naam(config_map: Optional[str]) -> str:
    """Zo noemt Claude Code zijn sleutelhanger-item per CLAUDE_CONFIG_DIR."""
    if not config_map:
        return "Claude Code-credentials"
    return "Claude Code-credentials-" + hashlib.sha256(config_map.encode()).hexdigest()[:8]


def _claude_oauth(config_map: Optional[str]) -> Optional[dict]:
    if sys.platform == "darwin":
        try:
            ruw = subprocess.run(["security", "find-generic-password", "-s", claude_sleutelhanger_naam(config_map), "-w"],
                                 capture_output=True, text=True, timeout=10).stdout
        except (OSError, subprocess.SubprocessError):
            return None
    else:
        pad = os.path.join(config_map or os.path.expanduser("~/.claude"), ".credentials.json")
        try:
            with open(pad) as f:
                ruw = f.read()
        except OSError:
            return None
    try:
        return json.loads(ruw).get("claudeAiOauth") or None
    except ValueError:
        return None


def _get(url: str, headers: dict) -> tuple[int, Any]:
    req = urllib.request.Request(url, headers={**headers, "User-Agent": "axe-core-usage/1"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400]
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        return 0, str(e)[:200]


# ── Per motor ────────────────────────────────────────────────────────────────

def _claude(motor: dict, get: Callable = _get, naam: str = "") -> dict:
    oauth = _claude_oauth((motor.get("extra_env") or {}).get("CLAUDE_CONFIG_DIR"))
    if not oauth or not oauth.get("accessToken"):
        return {"status": "not_logged_in", "reden": "No Claude login found for this account."}
    plan = oauth.get("subscriptionType")
    verloopt = oauth.get("expiresAt")
    if isinstance(verloopt, (int, float)) and verloopt / 1000 < time.time():
        return stand_na_verlopen_token(plan, (_planner_staat().get("warm") or {}).get(naam))
    code, body = get(CLAUDE_URL, {"Authorization": f"Bearer {oauth['accessToken']}",
                                  "anthropic-beta": "oauth-2025-04-20"})
    if code != 200 or not isinstance(body, dict):
        status, reden = status_uit_fout(code, str(body))
        return {"status": status, "plan": plan, "reden": reden}
    return {"status": "ok", "plan": plan, **vertaal_claude(body)}


def _codex(motor: dict, get: Callable = _get) -> dict:
    thuis = (motor.get("extra_env") or {}).get("CODEX_HOME") or os.path.expanduser("~/.codex")
    try:
        with open(os.path.join(thuis, "auth.json")) as f:
            tokens = json.load(f).get("tokens") or {}
    except (OSError, ValueError):
        return {"status": "not_logged_in", "reden": "No Codex login found for this account."}
    if not tokens.get("access_token"):
        return {"status": "not_logged_in", "reden": "No Codex login found for this account."}
    auth = jwt_claims(tokens.get("id_token") or "").get("https://api.openai.com/auth") or {}
    code, body = get(CODEX_URL, {"Authorization": f"Bearer {tokens['access_token']}",
                                 "ChatGPT-Account-Id": tokens.get("account_id") or auth.get("chatgpt_account_id") or ""})
    if code != 200 or not isinstance(body, dict):
        status, reden = status_uit_fout(code, str(body))
        return {"status": status, "plan": auth.get("chatgpt_plan_type"), "reden": reden}
    uit = vertaal_codex(body)
    uit["plan"] = uit.get("plan") or auth.get("chatgpt_plan_type")
    return {"status": "ok", **uit}


def _cursor(binary: Optional[str]) -> dict:
    if not binary:
        return {"status": "not_logged_in", "reden": "Cursor CLI not installed."}
    try:
        tekst = subprocess.run([binary, "about"], capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return {"status": "error", "reden": "cursor-agent about did not answer."}
    info = lees_cursor_about(tekst)
    if not info["account"]:
        return {"status": "not_logged_in", "reden": "Not signed in to Cursor."}
    return {"status": "ok", "plan": info["plan"], "dashboard": "https://cursor.com/dashboard?tab=usage",
            "reden": "Cursor only shows usage numbers on its own dashboard."}


def _planner_staat() -> dict:
    try:
        from planner import lees_staat
        return lees_staat()
    except Exception:  # noqa: BLE001
        return {}


def verbruik(engines: dict, status: dict, binary: Callable[[dict], Optional[str]], vers: bool = False) -> list[dict]:
    """Eén rij per abonnement-motor. engines = agent_runner.ENGINES, status = engine_status()."""
    nu = time.monotonic()
    kapot = (_planner_staat().get("account_kapot") or {})
    rijen = []
    for naam, motor in engines.items():
        if not naam.startswith(("claude", "codex", "cursor")):
            continue
        hit = _cache.get(naam)
        if hit and not vers and nu - hit[0] < CACHE_S:
            uit = hit[1]
        else:
            try:
                if naam.startswith("claude"):
                    uit = _claude(motor, naam=naam)
                elif naam.startswith("codex"):
                    uit = _codex(motor)
                else:
                    uit = _cursor(binary(motor))
            except Exception as e:  # noqa: BLE001
                log.warning("verbruik %s faalde: %s", naam, type(e).__name__)
                uit = {"status": "error", "reden": "Usage check failed."}
            # Een 429 op de check zegt niets over het account: hou dan de vorige meting.
            if hit and uit.get("status") == "error" and "rate limiting" in str(uit.get("reden")):
                uit = hit[1]
            _cache[naam] = (nu, uit)
        s = status.get(naam) or {}
        rij = {"motor": naam, "label": s.get("label") or naam, "account": s.get("account"),
               "login": motor.get("login"), **uit}
        # Wat de agents zelf meemaakten telt mee: een factuur of een verlopen sessie
        # zie je pas bij een echte run, niet in een statuscheck.
        k = kapot.get(naam)
        if k and rij.get("status") == "ok":
            r = str(k.get("reden", ""))
            if r.startswith("betaling"):
                rij["status"], rij["reden"] = "blocked", "Payment needed (unpaid invoice or no credit), seen on the last agent run."
            elif r.startswith("door de organisatie"):
                rij["status"], rij["reden"] = "blocked", "The organisation of this account switched off subscription access, seen on the last agent run."
            else:
                rij["status"], rij["reden"] = "expired", "Login failed on the last agent run. Log in again."
        rijen.append(rij)
    return rijen
