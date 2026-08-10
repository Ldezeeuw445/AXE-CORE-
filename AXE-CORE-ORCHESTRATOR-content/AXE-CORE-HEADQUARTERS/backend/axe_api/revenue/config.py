"""Operator settings — remembered once, reused everywhere.

The URLs and names in this system get typed into four different commands. That
is four chances to paste yesterday's URL into today's asset, and a tracked link
pointing at the wrong page is a sale you never see.

So they live in one file (`~/.axe/revenue_config.json`, override with
`REVENUE_CONFIG_PATH`), written by whichever step first learns them —
`deploy.sh` writes `tool_url` the moment a deploy succeeds — and read as
defaults by every command afterwards. An explicit flag always wins over the
stored value; nothing here is sticky in a way you cannot override.

Deliberately not secrets: no API keys, no tokens. Payment providers get
authorised in their own dashboards, and this file is plain JSON the operator is
expected to read and edit by hand.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional

DEFAULT_CONFIG_PATH = Path(
    os.environ.get("REVENUE_CONFIG_PATH", str(Path.home() / ".axe" / "revenue_config.json"))
)

# Only these keys are stored. An unknown key is almost always a typo, and a
# typo'd setting that silently does nothing is worse than an error.
KNOWN_KEYS = (
    "tool_url",       # the live free tool — where forum answers point
    "checkout_url",   # the paid rung — only ever linked from inside the tool
    "brand",          # wordmark next to the logo
    "product",        # product name on the listing
    "price",          # display price on the listing
    "pack",           # default query pack
    "identity",       # the single handle you post under
)


class ConfigError(ValueError):
    """A setting was named that this system does not have."""


def load(path: Optional[Path] = None) -> dict[str, Any]:
    p = Path(path) if path else DEFAULT_CONFIG_PATH
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ConfigError(f"{p} is not valid JSON: {e}") from e
    return {k: v for k, v in data.items() if k in KNOWN_KEYS}


def save(values: dict[str, Any], path: Optional[Path] = None) -> Path:
    """Merge into what is already there and write atomically."""
    p = Path(path) if path else DEFAULT_CONFIG_PATH
    unknown = [k for k in values if k not in KNOWN_KEYS]
    if unknown:
        raise ConfigError(
            f"unknown setting(s): {', '.join(unknown)}. Known: {', '.join(KNOWN_KEYS)}"
        )
    merged = {**load(p), **{k: v for k, v in values.items() if v is not None}}
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(merged, fh, indent=2, sort_keys=True)
        os.replace(tmp, p)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise
    return p


def get(key: str, override: Any = None, path: Optional[Path] = None, default: Any = None) -> Any:
    """Resolution order: explicit flag → stored config → default.

    An explicit empty string counts as "not given" — argparse hands back "" for
    unset string options, and treating that as an intentional blank would wipe
    a good stored URL on every run.
    """
    if override not in (None, ""):
        return override
    stored = load(path).get(key)
    return stored if stored not in (None, "") else default


def parse_assignments(pairs: list[str]) -> dict[str, str]:
    """`key=value` arguments from the CLI."""
    out: dict[str, str] = {}
    for pair in pairs:
        if "=" not in pair:
            raise ConfigError(f"expected key=value, got '{pair}'")
        key, _, value = pair.partition("=")
        out[key.strip()] = value.strip()
    return out
