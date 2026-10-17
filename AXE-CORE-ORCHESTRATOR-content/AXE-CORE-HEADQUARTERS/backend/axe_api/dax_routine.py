#!/usr/bin/env python3
"""dax-routine — het vaste werk van een DAX-bot, met herkomst die niemand kan verzinnen.

Dit bestand draait IN een DAX-container (alleen stdlib + wat het image al heeft:
python3, git, curl, Chromium via dax-browser). dax_wacht.py op de control plane
zet het daar neer als ~/.local/bin/dax-routine en houdt het bij (sha-vergelijk).

Waarom een script en niet "laat het model het doen": op 11 okt bleek een
automatisering voortgang te verzinnen. Hier doet het script het echte werk
(ophalen, meten, testen) en schrijft het een artefact met een bonnetje
(id, sha256, bronnen, HTTP-codes, tijd). Het model leest dat artefact en
schrijft er een verslag over; `dax-routine verify` controleert dat het
artefact vers is en dat het verslag naar dát bonnetje verwijst. Een verzonnen
verslag zonder echt artefact komt daar niet door.

    dax-routine sites|markets|energy|ideas|ci     doe het werk, print het bonnetje (JSON)
    dax-routine verify NAAM [--report PAD]        exit 0 + "VERIFIED <id>" als het klopt
    dax-routine last-error NAAM                   exit 0 + "ERROR ..." als de laatste run faalde (< 2 u)

Lukt het werk niet (bron plat, geen netwerk), dan schrijft het last-error.json
en eindigt het met exit 2. Er wordt nooit een leeg of nep-artefact geschreven.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ARTIFACTS = os.environ.get("DAX_ARTIFACTS", "/dax/artifacts")
WORKSPACE = os.environ.get("DAX_WORKSPACE", "/dax/workspace")
UA = "Mozilla/5.0 (X11; Linux x86_64) AXE-DAX/1.0"
MAX_LEEFTIJD_S = 2 * 3600

SITES = [
    "https://axecompanion.com",
    "https://axeheadquarters.com",
    "https://axon-memory.com",
    "https://app.axon-memory.com",
    "https://api.axecompanion.com/health",
]
MARKTEN = {"GC=F": "Gold futures", "EURUSD=X": "EUR/USD", "^GSPC": "S&P 500"}
ENERGIE = {"BZ=F": "Brent crude", "CL=F": "WTI crude", "NG=F": "Henry Hub natural gas", "HO=F": "Heating oil (ULSD)"}
REPO = "https://github.com/Ldezeeuw445/AXE-CORE-.git"
CI_TESTS = ["test_missies.py", "test_planning.py", "test_dax_wacht.py"]


def nu() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def map_voor(naam: str) -> str:
    pad = os.path.join(ARTIFACTS, naam)
    os.makedirs(pad, exist_ok=True)
    return pad


class Mislukt(Exception):
    pass


def http(url: str, timeout: float = 20) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() or b""


def yahoo(symbool: str) -> dict:
    """Dagkoersen van de laatste 3 maanden uit Yahoo's publieke chart-API."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(symbool)}?range=3mo&interval=1d"
    status, body = http(url)
    if status != 200:
        raise Mislukt(f"{symbool}: HTTP {status} from Yahoo chart API")
    data = json.loads(body)
    res = ((data.get("chart") or {}).get("result") or [None])[0]
    if not res:
        raise Mislukt(f"{symbool}: no chart result")
    tijden = res.get("timestamp") or []
    slot = ((res.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    rijen = [(t, c) for t, c in zip(tijden, slot) if c is not None]
    if len(rijen) < 20:
        raise Mislukt(f"{symbool}: only {len(rijen)} closes")
    closes = [c for _, c in rijen]

    def sma(n: int) -> float | None:
        return round(sum(closes[-n:]) / n, 4) if len(closes) >= n else None

    winst = verlies = 0.0
    for a, b in zip(closes[-15:-1], closes[-14:]):
        d = b - a
        winst += max(d, 0)
        verlies += max(-d, 0)
    rsi = 100.0 if verlies == 0 else round(100 - 100 / (1 + winst / verlies), 2)
    laatste_t = datetime.fromtimestamp(rijen[-1][0], timezone.utc).strftime("%Y-%m-%d")
    return {
        "symbol": symbool, "source": url, "http": status, "last_date": laatste_t,
        "last_close": round(closes[-1], 4), "prev_close": round(closes[-2], 4),
        "change_1d_pct": round((closes[-1] / closes[-2] - 1) * 100, 3),
        "change_5d_pct": round((closes[-1] / closes[-6] - 1) * 100, 3) if len(closes) > 5 else None,
        "sma20": sma(20), "sma50": sma(50), "rsi14": rsi, "closes_used": len(closes),
    }


# ── Het werk ─────────────────────────────────────────────────────────────────

def werk_sites() -> dict:
    uit = []
    schermen = os.path.join(map_voor("sites"), "shots")
    os.makedirs(schermen, exist_ok=True)
    for url in SITES:
        rij: dict = {"url": url}
        t0 = time.monotonic()
        try:
            status, body = http(url, timeout=20)
            rij.update(http=status, bytes=len(body), ms=int((time.monotonic() - t0) * 1000))
        except Exception as e:  # noqa: BLE001 — een plat adres is een meetwaarde, geen crash
            rij.update(http=None, error=str(e)[:200])
        shot = os.path.join(schermen, hashlib.sha1(url.encode()).hexdigest()[:10] + ".png")
        try:
            p = subprocess.run(["dax-browser", "open", url, "--screenshot", shot],
                               capture_output=True, text=True, timeout=90)
            if p.returncode == 0:
                b = json.loads(p.stdout.strip().splitlines()[-1])
                rij.update(title=b.get("title"), final_url=b.get("url"), screenshot=shot)
            else:
                rij["browser_error"] = (p.stderr or p.stdout)[-300:]
        except Exception as e:  # noqa: BLE001
            rij["browser_error"] = str(e)[:300]
        uit.append(rij)
    if not any(r.get("http") for r in uit):
        raise Mislukt("no site answered at all — the DAX probably has no network")
    return {"sites": uit, "up": sum(1 for r in uit if r.get("http") and r["http"] < 400), "total": len(uit)}


def werk_markets() -> dict:
    return {"instruments": [dict(yahoo(s), name=n) for s, n in MARKTEN.items()],
            "note": "Read-only market data. No orders were placed or prepared."}


def werk_energy() -> dict:
    return {"instruments": [dict(yahoo(s), name=n) for s, n in ENERGIE.items()],
            "note": "Read-only market context for the NorthSea desk. Nothing was sent."}


def werk_ideas() -> dict:
    status, body = http("https://hacker-news.firebaseio.com/v0/topstories.json")
    if status != 200:
        raise Mislukt(f"Hacker News top stories: HTTP {status}")
    ids = json.loads(body)[:20]
    verhalen = []
    for i in ids:
        s, b = http(f"https://hacker-news.firebaseio.com/v0/item/{i}.json", timeout=10)
        if s == 200:
            it = json.loads(b) or {}
            verhalen.append({"id": it.get("id"), "title": it.get("title"), "url": it.get("url"),
                             "score": it.get("score"), "comments": it.get("descendants")})
    if len(verhalen) < 10:
        raise Mislukt(f"only {len(verhalen)} stories could be read")
    return {"source": "https://hacker-news.firebaseio.com/v0/topstories.json", "stories": verhalen}


def _sh(cmd: list[str], cwd: str | None = None, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def werk_ci() -> dict:
    """Haal orchestrator op (publieke repo, alleen lezen) en draai de pure backendtests."""
    repo = os.path.join(WORKSPACE, "repos", "AXE-CORE-")
    if not os.path.isdir(os.path.join(repo, ".git")):
        os.makedirs(os.path.dirname(repo), exist_ok=True)
        p = _sh(["git", "clone", "--depth", "30", "--branch", "orchestrator", REPO, repo], timeout=600)
        if p.returncode != 0:
            raise Mislukt(f"git clone failed: {(p.stderr or p.stdout)[-300:]}")
    else:
        p = _sh(["git", "fetch", "--depth", "30", "origin", "orchestrator"], cwd=repo)
        if p.returncode != 0:
            raise Mislukt(f"git fetch failed: {p.stderr[-300:]}")
        _sh(["git", "reset", "--hard", "-q", "origin/orchestrator"], cwd=repo)
    sha = _sh(["git", "rev-parse", "HEAD"], cwd=repo).stdout.strip()
    onderwerp = _sh(["git", "log", "-1", "--format=%s"], cwd=repo).stdout.strip()
    api = os.path.join(repo, "AXE-CORE-ORCHESTRATOR-content", "AXE-CORE-HEADQUARTERS", "backend", "axe_api")
    comp = _sh([sys.executable, "-m", "compileall", "-q", "."], cwd=api, timeout=300)
    # Geen venv: het image heeft geen ensurepip (11 okt: "venv failed"). De testpakketten gaan
    # met --user in het home-volume van deze DAX en blijven daar staan.
    py = sys.executable
    p = _sh([py, "-m", "pip", "install", "-q", "--user", "--break-system-packages",
             "pytest", "croniter", "python-dateutil", "tzdata"], timeout=600)
    if p.returncode != 0:
        raise Mislukt(f"pip install failed: {(p.stderr or p.stdout)[-300:]}")
    tests = [t for t in CI_TESTS if os.path.exists(os.path.join(api, t))]
    t = _sh([py, "-m", "pytest", "-q", "-p", "no:cacheprovider", *tests], cwd=api, timeout=900)
    staart = (t.stdout or "")[-1500:]
    samenvatting = next((r for r in reversed(staart.splitlines()) if " passed" in r or " failed" in r or " error" in r), "")
    return {
        "repo": REPO, "branch": "orchestrator", "commit": sha, "subject": onderwerp,
        "compileall_exit": comp.returncode, "compileall_errors": (comp.stdout + comp.stderr)[-800:],
        "pytest_exit": t.returncode, "pytest_files": tests, "pytest_summary": samenvatting,
        "pytest_tail": staart, "pushed": False,
    }


WERK = {"sites": werk_sites, "markets": werk_markets, "energy": werk_energy, "ideas": werk_ideas, "ci": werk_ci}


def doe(naam: str) -> int:
    map_ = map_voor(naam)
    begin = nu()
    try:
        data = WERK[naam]()
    except Exception as e:  # noqa: BLE001 — elke fout wordt een eerlijke foutregel
        fout = {"routine": naam, "at": nu(), "error": f"{type(e).__name__}: {str(e)[:500]}"}
        with open(os.path.join(map_, "last-error.json"), "w") as f:
            json.dump(fout, f, indent=1)
        print(json.dumps({"ok": False, **fout}))
        return 2
    lichaam = json.dumps(data, sort_keys=True, default=str)
    sha = hashlib.sha256(lichaam.encode()).hexdigest()
    rid = f"{naam}-{begin.replace(':', '').replace('-', '')}-{sha[:8]}"
    artefact = {"id": rid, "routine": naam, "dax": os.environ.get("DAX_ID"), "started_at": begin,
                "finished_at": nu(), "sha256": sha, "data": data}
    pad = os.path.join(map_, f"{rid}.json")
    with open(pad, "w") as f:
        json.dump(artefact, f, indent=1, default=str)
    with open(os.path.join(map_, "latest.json"), "w") as f:
        json.dump({"id": rid, "path": pad, "sha256": sha, "at": artefact["finished_at"]}, f)
    try:
        os.remove(os.path.join(map_, "last-error.json"))
    except OSError:
        pass
    print(json.dumps({"ok": True, "id": rid, "artifact": pad, "sha256": sha,
                      "report_path": os.path.join(map_, f"report-{rid}.md")}))
    return 0


def _leeftijd(iso: str) -> float:
    t = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - t).total_seconds()


def verify(naam: str, rapport: str | None) -> int:
    map_ = map_voor(naam)
    try:
        with open(os.path.join(map_, "latest.json")) as f:
            laatste = json.load(f)
        with open(laatste["path"]) as f:
            artefact = json.load(f)
    except Exception as e:  # noqa: BLE001
        print(f"NOT VERIFIED: no artifact for {naam} ({e})")
        return 1
    lichaam = json.dumps(artefact.get("data"), sort_keys=True, default=str)
    if hashlib.sha256(lichaam.encode()).hexdigest() != artefact.get("sha256"):
        print("NOT VERIFIED: artifact content does not match its sha256 (edited after the run)")
        return 1
    leeftijd = _leeftijd(artefact["finished_at"])
    if leeftijd > MAX_LEEFTIJD_S:
        print(f"NOT VERIFIED: newest artifact is {int(leeftijd)}s old")
        return 1
    if rapport:
        try:
            with open(rapport) as f:
                tekst = f.read()
        except OSError as e:
            print(f"NOT VERIFIED: report missing ({e})")
            return 1
        if artefact["id"] not in tekst or len(tekst.strip()) < 80:
            print(f"NOT VERIFIED: report does not cite artifact id {artefact['id']} or is too short")
            return 1
    print(f"VERIFIED {artefact['id']} sha256={artefact['sha256'][:16]} age={int(leeftijd)}s")
    return 0


def laatste_fout(naam: str) -> int:
    try:
        with open(os.path.join(map_voor(naam), "last-error.json")) as f:
            fout = json.load(f)
    except OSError:
        print(f"no recorded error for {naam}")
        return 1
    if _leeftijd(fout["at"]) > MAX_LEEFTIJD_S:
        print(f"last error for {naam} is older than 2h")
        return 1
    print(f"ERROR {naam} at {fout['at']}: {fout['error']}")
    return 0


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 64
    cmd = argv[0]
    if cmd in WERK:
        return doe(cmd)
    if cmd == "verify" and len(argv) >= 2 and argv[1] in WERK:
        rest = argv[2:]
        rapport = rest[rest.index("--report") + 1] if "--report" in rest[:-1] else None
        return verify(argv[1], rapport)
    if cmd == "last-error" and len(argv) >= 2 and argv[1] in WERK:
        return laatste_fout(argv[1])
    print(f"unknown command: {' '.join(argv)}")
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
