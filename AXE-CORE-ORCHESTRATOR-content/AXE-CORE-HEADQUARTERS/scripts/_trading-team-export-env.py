"""Emit export lines for AXE_TRADING_TEAM_* from Headquarters .env. Never prints values to stdout except export statements."""
import shlex
from pathlib import Path

def main() -> None:
    p = Path(".env")
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        k = k.strip()
        if not k.startswith("AXE_TRADING_TEAM_"):
            continue
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        print(f"export {k}={shlex.quote(v)}")

if __name__ == "__main__":
    main()
