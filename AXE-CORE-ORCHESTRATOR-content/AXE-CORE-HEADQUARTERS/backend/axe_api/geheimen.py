"""Sleutels horen niet in het geheugen dat naar een model gaat.

Gevonden 30 okt 2026: `saveSetting` zet elke instelling ook als voorkeur in
global_memory, en de geheugencontext geeft voorkeuren voorrang. Zo stonden de
GitHub-sleutel (alle rechten, verloopt nooit) en de OpenAI- en Anthropic-
sleutels in het geheugen dat in prompts terechtkomt. De echte waarden staan in
user_settings; het geheugen heeft er alleen een kopie van, en die mag zonder.

Uitzondering: `cfg:`-rijen. Dat is de bewaarplek van durableConfigService (de
MetaApi-verbinding, de trading-accounts) en daar zijn de waarden zelf nodig.
Ze worden dus niet verborgen bij het schrijven, maar gaan ook nooit mee als
iemand het geheugen in het algemeen leest; alleen wie om `cfg:` vraagt krijgt ze.
"""
from __future__ import annotations

import re

VERBORGEN = "[hidden]"

# Waarden die op zichzelf een sleutel zijn, waar ze ook staan.
_SLEUTEL = re.compile(
    r"(?<![A-Za-z0-9])("
    r"gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|"
    r"sk-(?:ant-|proj-)?[A-Za-z0-9_-]{30,}|xai-[A-Za-z0-9]{30,}|"
    r"(?:sk|rk)_live_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|"
    r"AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|xox[abp]-[A-Za-z0-9-]{20,}|"
    r"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"
    r")"
)
_PRIVE_SLEUTEL = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)
# Een veld dat zegt wat het is, ook als de waarde geen bekend formaat heeft
# (een broker-wachtwoord, een MetaApi-token). Ook met escapes, want de waarde in
# global_memory is vaak JSON in JSON.
_VELD = re.compile(
    r'(\\?"(?:token|api_?key|apiKey|secret|client_secret|password|passwd|wachtwoord|'
    r'access_token|refresh_token|private_key|auth_token)\\?"\s*:\s*\\?")([^"\\]{6,})(\\?")',
    re.I,
)


def is_config_sleutel(key: str | None) -> bool:
    return str(key or "").startswith("cfg:")


def verberg_geheimen(tekst: str | None) -> str:
    """Zelfde tekst, met elke sleutel vervangen door [hidden]."""
    t = str(tekst or "")
    if not t:
        return t
    t = _PRIVE_SLEUTEL.sub(VERBORGEN, t)
    t = _VELD.sub(lambda m: f"{m.group(1)}{VERBORGEN}{m.group(3)}", t)
    return _SLEUTEL.sub(VERBORGEN, t)
