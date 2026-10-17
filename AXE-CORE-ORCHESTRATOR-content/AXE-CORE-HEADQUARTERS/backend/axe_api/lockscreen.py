"""Alles wat het slotscherm van de telefoon wil weten, in één antwoord.

## Waarom één aanroep

Het slotscherm draait vóór ontgrendelen, bij elke wake, op een telefoon met een zwakke
verbinding. Zes losse aanroepen (koersen, drie machines, zes diensten, drie soorten meldingen)
zijn zes kansen op een halve kaart. Eén `/lockscreen/snapshot` kan ook één keer per minuut
gecachet worden, zodat het wakker worden van de telefoon geen werk geeft aan de bronnen.

## Wat er echt is en wat niet

Elk getal hier komt ergens vandaan. Een misser is `None`, nooit een verzonnen koers.
Een koers die we eerder wél hadden blijft staan met `stale` en `last_updated_label`
("Last updated 14:52 UTC") — het slotscherm toont dat in plaats van een streepje.
Alleen als er nog nooit een koers was, blijft het veld leeg.

- **Koersen**: eerst vrije bronnen zonder sleutel (Coinbase/Kraken voor BTC,
  Yahoo-chart of Stooq-CSV voor XAU/SPY/QQQ). Twelve Data alleen als die
  zwijgen én het dagbudget nog ruimte heeft voor 'overig'. `LOCKSCREEN_SYMBOLS`
  past de tickers aan. Een 429 wordt niet 300 s als 'geen prijs' gecachet.
- **Machines**: de VPS meet zichzelf; de Mac mini en de iMac worden via de omgekeerde tunnel
  van de Mac mini gemeten (zie agent_tunnel.py). De iMac bereikt de Mac mini met SSH.
- **Diensten**: AXE API, Database, Models, Workers, NorthSea en MCP, elk met een eigen echte
  controle. "Caddy" staat er niet: er draait hier nginx, en een lampje voor iets wat niet
  draait zou precies het soort leugen zijn dat dit scherm niet mag vertellen.
- **Aandacht**: openstaande goedkeuringen, mislukte planner-taken van de laatste 24 uur en
  de nieuwste meldingen -- in die volgorde van belang.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

# ── Machines: parsers ──────────────────────────────────────────────────────────────

#: Wat we op een Mac laten draaien (lokaal of via SSH). Drie secties, gescheiden door ---.
MAC_PROBE = (
    "top -l 2 -n 0 -s 1 | grep 'CPU usage' | tail -1; echo ---; "
    "vm_stat; echo ---; sysctl -n hw.memsize; echo ---; df -k \"$HOME\" | tail -1"
)


#: Hetzelfde voor een Linux-box (de modelbox), via SSH vanaf de Mac mini. Twee metingen van /proc/stat
#: een halve seconde uit elkaar: procent in gebruik is 1 - (idle-verschil / totaal-verschil).
LINUX_PROBE = (
    "p() { awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5+$6}' /proc/stat; }; "
    "a=$(p); sleep 0.5; b=$(p); echo \"CPU $a $b\"; "
    "awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{print \"MEM\", t, a}' /proc/meminfo; "
    "df -P / | awk 'NR==2{print \"DISK\", $5}'"
)


def parse_linux_probe(output: str) -> dict[str, Optional[float]]:
    """De uitvoer van LINUX_PROBE -> {cpu, mem, disk}. Elk veld apart None als zijn regel ontbreekt of rommel is."""
    out: dict[str, Optional[float]] = {"cpu": None, "mem": None, "disk": None}
    for line in (output or "").splitlines():
        f = line.split()
        try:
            if f[0] == "CPU" and len(f) == 5:
                t1, i1, t2, i2 = (float(x) for x in f[1:])
                if t2 > t1:
                    out["cpu"] = round(max(0.0, min(100.0, (1 - (i2 - i1) / (t2 - t1)) * 100)), 1)
            elif f[0] == "MEM" and len(f) == 3:
                total, avail = float(f[1]), float(f[2])
                if total > 0:
                    out["mem"] = round(max(0.0, min(100.0, (total - avail) / total * 100)), 1)
            elif f[0] == "DISK" and len(f) == 2:
                out["disk"] = round(float(f[1].rstrip("%")), 1)
        except (ValueError, IndexError):
            continue
    return out


def parse_top_cpu(text: str) -> Optional[float]:
    """'CPU usage: 8.33% user, 12.5% sys, 79.16% idle' -> 20.8 (procent in gebruik)."""
    m = re.search(r"([\d.]+)%\s*idle", text or "")
    if not m:
        return None
    return round(max(0.0, min(100.0, 100.0 - float(m.group(1)))), 1)


def parse_vm_stat(text: str, memsize_bytes: int) -> Optional[float]:
    """Geheugen in gebruik, zoals Activity Monitor het telt: actief + vast + gecomprimeerd.

    Inactief en gecachet geheugen telt niet mee: macOS geeft dat terug zodra iets het nodig
    heeft, en "92% vol" bij een gezonde Mac zou dit scherm voortdurend alarm laten slaan.
    """
    if not text or memsize_bytes <= 0:
        return None
    size = re.search(r"page size of (\d+) bytes", text)
    if not size:
        return None
    page = int(size.group(1))

    def pages(label: str) -> int:
        m = re.search(rf"{re.escape(label)}:\s+(\d+)\.", text)
        return int(m.group(1)) if m else 0

    used = (pages("Pages active") + pages("Pages wired down") + pages("Pages occupied by compressor")) * page
    return round(max(0.0, min(100.0, used / memsize_bytes * 100)), 1)


def parse_df_line(line: str) -> Optional[float]:
    """`df -k` regel: Filesystem 1024-blocks Used Available Capacity ... -> % in gebruik."""
    parts = (line or "").split()
    if len(parts) < 4:
        return None
    try:
        used, avail = int(parts[2]), int(parts[3])
    except ValueError:
        return None
    total = used + avail
    return round(used / total * 100, 1) if total > 0 else None


def parse_mac_probe(output: str) -> dict[str, Optional[float]]:
    """De volledige uitvoer van MAC_PROBE -> {cpu, mem, disk}. Elk veld apart None bij een mislukte sectie."""
    sections = [s.strip() for s in (output or "").split("---")]
    while len(sections) < 4:
        sections.append("")
    cpu_s, vm_s, mem_s, df_s = sections[:4]
    try:
        memsize = int(mem_s.split()[0])
    except (ValueError, IndexError):
        memsize = 0
    return {"cpu": parse_top_cpu(cpu_s), "mem": parse_vm_stat(vm_s, memsize), "disk": parse_df_line(df_s)}


def _linux_cpu_pct(sample_s: float = 0.4) -> Optional[float]:
    """Twee metingen van /proc/stat met een korte pauze: een momentopname, geen gemiddelde sinds boot."""
    def read() -> Optional[tuple[int, int]]:
        try:
            with open("/proc/stat") as f:
                v = [int(x) for x in f.readline().split()[1:]]
        except (OSError, ValueError):
            return None
        idle = v[3] + (v[4] if len(v) > 4 else 0)
        return sum(v), idle

    a = read()
    if a is None:
        return None
    time.sleep(sample_s)
    b = read()
    if b is None or b[0] == a[0]:
        return None
    return round(max(0.0, min(100.0, (1 - (b[1] - a[1]) / (b[0] - a[0])) * 100)), 1)


def _linux_mem_pct() -> Optional[float]:
    try:
        info: dict[str, int] = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, _, rest = line.partition(":")
                p = rest.split()
                if p:
                    info[k] = int(p[0])
        total = info.get("MemTotal", 0)
        return round((total - info.get("MemAvailable", total)) / total * 100, 1) if total else None
    except (OSError, ValueError):
        return None


def local_metrics() -> dict[str, Optional[float]]:
    """cpu/mem/disk van DEZE machine, in procenten. Blokkerend (≈0,4 s Linux, ≈2 s Mac): draai in een thread."""
    if os.uname().sysname == "Darwin":
        try:
            out = subprocess.run(["bash", "-c", MAC_PROBE], capture_output=True, text=True, timeout=15).stdout
            return parse_mac_probe(out)
        except (subprocess.SubprocessError, OSError):
            return {"cpu": None, "mem": None, "disk": None}
    try:
        total, used, _free = shutil.disk_usage("/")
        disk = round(used / total * 100, 1) if total else None
    except OSError:
        disk = None
    return {"cpu": _linux_cpu_pct(), "mem": _linux_mem_pct(), "disk": disk}


def imac_metrics(target: str, timeout: float = 20.0) -> dict[str, Optional[float]]:
    """Dezelfde meting op de iMac, via SSH vanaf de Mac mini. Blokkerend; draai in een thread."""
    out = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=yes", target,
         "export PATH=/usr/bin:/bin:/usr/sbin:/sbin; " + MAC_PROBE],
        capture_output=True, text=True, timeout=timeout,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ssh {out.returncode}")
    return parse_mac_probe(out.stdout)


def linux_ssh_metrics(target: str, key: Optional[str] = None, timeout: float = 20.0) -> dict[str, Optional[float]]:
    """Dezelfde meting op een Linux-box, via SSH. Blokkerend; draai in een thread."""
    cmd = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=yes"]
    if key:
        cmd += ["-i", key, "-o", "IdentitiesOnly=yes"]
    out = subprocess.run(cmd + [target, LINUX_PROBE], capture_output=True, text=True, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError(f"ssh {out.returncode}")
    return parse_linux_probe(out.stdout)


# ── Koersen ──────────────────────────────────────────────────────────────────────

DEFAULT_SYMBOLS = (
    ("XAU/USD", "XAUUSD"),
    ("BTC/USD", "BTCUSD"),
    ("SPY", "SPY"),
    ("QQQ", "QQQ"),
)

#: Venster -> aantal 1-uurskaarsen terug. 1D is 24, niet 1440: de schets is uurkoersen.
WINDOWS = {"1H": 1, "4H": 4, "1D": 24}

# Yahoo chart (geen sleutel). XAUUSD=X geeft 404; GC=F is COMEX-goud, gemeten 17 okt 2026.
YAHOO_TICKER = {
    "XAU/USD": "GC=F", "XAUUSD": "GC=F",
    "SPY": "SPY", "QQQ": "QQQ",
    "BTC/USD": "BTC-USD", "BTCUSD": "BTC-USD",
}
STOOQ_TICKER = {
    "XAU/USD": "xauusd", "XAUUSD": "xauusd",
    "SPY": "spy.us", "QQQ": "qqq.us",
    "BTC/USD": "btcusd", "BTCUSD": "btcusd",
}


def yahoo_candles(payload: dict) -> list[dict]:
    """query1.finance.yahoo.com/v8/finance/chart → kaarsen voor candle_summary."""
    try:
        res = ((payload or {}).get("chart") or {}).get("result") or []
        blok = res[0]
        ts = blok.get("timestamp") or []
        q = ((blok.get("indicators") or {}).get("quote") or [{}])[0]
        closes = q.get("close") or []
    except (IndexError, TypeError, AttributeError):
        return []
    out = []
    for i, t in enumerate(ts):
        if i >= len(closes) or closes[i] is None:
            continue
        try:
            out.append({"time": datetime.fromtimestamp(int(t), timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                        "close": float(closes[i])})
        except (TypeError, ValueError, OSError):
            continue
    if not out:
        meta = blok.get("meta") or {}
        try:
            price = float(meta["regularMarketPrice"])
            t = int(meta["regularMarketTime"])
        except (KeyError, TypeError, ValueError):
            return []
        out.append({"time": datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                    "close": price})
    return out


def stooq_last_candles(csv: str) -> list[dict]:
    """Stooq last-quote CSV (s=…&f=sd2t2ohlcv) → één of meer rijen."""
    rows = []
    for line in (csv or "").splitlines()[1:]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 7:
            continue
        _sym, date, tm, _o, _h, _l, close = parts[:7]
        if not date or date.lower() == "n/d" or not close:
            continue
        try:
            rows.append({"time": f"{date} {tm or '00:00:00'}", "close": float(close)})
        except ValueError:
            continue
    return rows


def coinbase_spot_candles(payload: dict) -> list[dict]:
    """api.coinbase.com/v2/prices/BTC-USD/spot → één punt, nu."""
    try:
        amount = float(((payload or {}).get("data") or {}).get("amount"))
    except (TypeError, ValueError):
        return []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return [{"time": now, "close": amount}]


def kraken_ticker_candles(payload: dict) -> list[dict]:
    """api.kraken.com/0/public/Ticker?pair=XBTUSD → laatste trade-prijs."""
    result = (payload or {}).get("result") or {}
    if not isinstance(result, dict):
        return []
    for blok in result.values():
        if not isinstance(blok, dict):
            continue
        last = blok.get("c")
        try:
            price = float(last[0] if isinstance(last, (list, tuple)) else last)
        except (TypeError, ValueError, IndexError):
            continue
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        return [{"time": now, "close": price}]
    return []


def vrije_samenvatting(symbol: str, bron: str, candles: list[dict]) -> Optional[dict]:
    s = candle_summary(candles)
    if not s:
        return None
    s["source"] = bron
    return s


async def haal_vrije_koers(symbol: str, client: Any) -> Optional[dict]:
    """Echte publieke tickers, geen sleutel. None als elke bron zwijgt."""
    headers = {"User-Agent": "AXE-CORE-lockscreen/1"}
    key = symbol.strip().upper()
    if key in ("BTC/USD", "BTCUSD"):
        try:
            r = await client.get("https://api.coinbase.com/v2/prices/BTC-USD/spot", headers=headers, timeout=8)
            s = vrije_samenvatting(symbol, "coinbase", coinbase_spot_candles(r.json()))
            if s:
                return s
        except Exception:  # noqa: BLE001
            pass
        try:
            r = await client.get("https://api.kraken.com/0/public/Ticker?pair=XBTUSD", headers=headers, timeout=8)
            s = vrije_samenvatting(symbol, "kraken", kraken_ticker_candles(r.json()))
            if s:
                return s
        except Exception:  # noqa: BLE001
            pass
    yahoo = YAHOO_TICKER.get(key) or YAHOO_TICKER.get(symbol)
    if yahoo:
        try:
            r = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo}",
                params={"interval": "1h", "range": "5d"},
                headers=headers, timeout=10,
            )
            s = vrije_samenvatting(symbol, "yahoo", yahoo_candles(r.json()))
            if s:
                return s
        except Exception:  # noqa: BLE001
            pass
    stooq = STOOQ_TICKER.get(key) or STOOQ_TICKER.get(symbol)
    if stooq:
        try:
            r = await client.get(
                f"https://stooq.com/q/l/?s={stooq}&f=sd2t2ohlcv&h&e=csv",
                headers=headers, timeout=10,
            )
            s = vrije_samenvatting(symbol, "stooq", stooq_last_candles(r.text))
            if s:
                return s
        except Exception:  # noqa: BLE001
            pass
    return None


def parse_symbols(raw: str | None) -> tuple[tuple[str, str], ...]:
    """'XAU/USD:XAUUSD,SPY' -> (('XAU/USD','XAUUSD'),('SPY','SPY')). Leeg of onzin -> de standaard."""
    out = []
    for item in (raw or "").split(","):
        item = item.strip()
        if not item:
            continue
        sym, _, label = item.partition(":")
        out.append((sym.strip(), (label or sym).strip().replace("/", "")))
    return tuple(out) or DEFAULT_SYMBOLS


def candle_iso(raw: Any) -> Optional[str]:
    """Twelve Data's '2026-10-17 13:00:00' (geen zone) -> ISO-UTC. Rommel -> None."""
    dt = _parse_ts(raw)
    return dt.isoformat() if dt else None


def last_updated_label(ts: Any, now: datetime | None = None) -> Optional[str]:
    """Zin die het slotscherm toont in plaats van een streepje: 'Last updated 14:52 UTC'."""
    dt = _parse_ts(ts)
    if not dt:
        return None
    stamp = dt.astimezone(timezone.utc).strftime("%H:%M")
    if now is None:
        return f"Last updated {stamp} UTC"
    age = max(0, int((now - dt).total_seconds()))
    if age < 3600:
        return f"Last updated {stamp} UTC"
    if age < 86400:
        return f"Last updated {age // 3600}h ago"
    return f"Last updated {age // 86400}d ago"


def candle_summary(candles: list[dict], max_points: int = 24) -> Optional[dict]:
    """Kaarsen (oud -> nieuw of andersom) -> laatste koers, schets en verandering per venster.

    Eén geldige kaars is genoeg voor de koers (weekend / dunne feed). Vensters blijven
    leeg tot er een tweede punt is — geen verzonnen 0%-verandering.
    """
    rows = []
    for c in candles or []:
        try:
            rows.append((str(c["time"]), float(c["close"])))
        except (KeyError, TypeError, ValueError):
            continue
    if not rows:
        return None
    rows.sort(key=lambda r: r[0])  # oplopend in tijd, wat de bron ook zegt
    closes = [r[1] for r in rows]
    price = closes[-1]
    chg: dict[str, dict[str, float]] = {}
    if len(closes) >= 2:
        for name, back in WINDOWS.items():
            ref = closes[max(0, len(closes) - 1 - back)]
            if ref:
                chg[name] = {"abs": round(price - ref, 4), "pct": round((price - ref) / ref * 100, 2)}
    return {
        "price": price,
        "spark": [round(x, 4) for x in closes[-max_points:]],
        "chg": chg,
        "last_updated": candle_iso(rows[-1][0]),
        "stale": False,
    }


def empty_market(symbol: str, label: str) -> dict:
    return {
        "symbol": symbol, "label": label, "price": None, "spark": [], "chg": {},
        "last_updated": None, "stale": True, "last_updated_label": None,
    }


def market_row(symbol: str, label: str, summary: Optional[dict], store: "LastGoodQuotes",
               now: datetime | None = None) -> dict:
    """Verse samenvatting wint; anders de laatst goede koers met 'Last updated', nooit een verzonnen prijs."""
    when = now or datetime.now(timezone.utc)
    if summary and summary.get("price") is not None:
        row = {
            "symbol": symbol, "label": label,
            "price": summary["price"], "spark": summary.get("spark") or [],
            "chg": summary.get("chg") or {},
            "last_updated": summary.get("last_updated"),
            "stale": False,
            "last_updated_label": last_updated_label(summary.get("last_updated"), when),
        }
        store.put(label, row)
        return row
    prev = store.get(label)
    if prev and prev.get("price") is not None:
        return {
            **prev,
            "symbol": symbol, "label": label,
            "stale": True,
            "last_updated_label": last_updated_label(prev.get("last_updated"), when),
        }
    return empty_market(symbol, label)


def verse_koersen(rows: Any) -> bool:
    """Alleen een verse (niet-stale) koers mag de 5-minutencache vullen — een lege feed niet."""
    if not isinstance(rows, list):
        return False
    return any(isinstance(r, dict) and r.get("price") is not None and not r.get("stale") for r in rows)


class LastGoodQuotes:
    """Laatst goede koers, in geheugen én op schijf, zodat een korte Twelve Data-storing geen streepjes geeft.

    De VPS herstart bij een deploy; zonder bestand zou de eerste misser na boot weer '—' zijn.
    """

    def __init__(self, pad: str | None = None) -> None:
        self._pad = pad if pad is not None else _default_quotes_path()
        self._data: dict[str, dict] = self._lees()

    def get(self, label: str) -> Optional[dict]:
        row = self._data.get(label)
        return dict(row) if row else None

    def put(self, label: str, row: dict) -> None:
        if row.get("price") is None:
            return
        self._data[label] = {
            k: row[k] for k in ("symbol", "label", "price", "spark", "chg", "last_updated") if k in row
        }
        self._schrijf()

    def _lees(self) -> dict[str, dict]:
        if not self._pad:
            return {}
        try:
            with open(self._pad, encoding="utf-8") as f:
                raw = json.load(f)
        except (OSError, ValueError):
            return {}
        return raw if isinstance(raw, dict) else {}

    def _schrijf(self) -> None:
        if not self._pad:
            return
        try:
            os.makedirs(os.path.dirname(self._pad) or ".", exist_ok=True)
            tmp = self._pad + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._data, f)
            os.replace(tmp, self._pad)
        except OSError:
            return


def _default_quotes_path() -> str:
    gekozen = (os.environ.get("LOCKSCREEN_LAST_QUOTES") or "").strip()
    if gekozen:
        return gekozen
    for pad in ("/opt/axe-core-api/ls-markets-last.json", "/tmp/axe-ls-markets-last.json"):
        mapa = os.path.dirname(pad)
        if os.path.isdir(mapa) and os.access(mapa, os.W_OK):
            return pad
    return "/tmp/axe-ls-markets-last.json"


# ── Aandacht ─────────────────────────────────────────────────────────────────────

SEVERITY = {"critical": 0, "warning": 1, "info": 2}


def _parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def ago_seconds(ts: Any, now: datetime) -> Optional[int]:
    dt = _parse_ts(ts)
    return max(0, int((now - dt).total_seconds())) if dt else None


def attention_items(
    approvals: list[dict], failed_schedules: list[dict], notifications: list[dict], now: datetime,
) -> list[dict]:
    """Drie bronnen -> één lijst, per onderwerp ontdubbeld, belangrijkste eerst, dan nieuwste eerst.

    Ontdubbelen is geen detail: dezelfde "Yes needed: DEAL-002" stond als drie afzonderlijke
    goedkeuringen in de wachtrij, en drie regels voor één vraag zou de kaart vullen met herhaling.
    Het aantal staat in `count`, zodat de kaart "(3)" kan zeggen zonder het drie keer te tonen.
    """
    items: dict[str, dict] = {}

    def add(key: str, severity: str, title: str, ts: Any, route: str) -> None:
        age = ago_seconds(ts, now)
        cur = items.get(key)
        if cur:
            cur["count"] += 1
            if age is not None and (cur["ago_s"] is None or age < cur["ago_s"]):
                cur["ago_s"] = age
            return
        items[key] = {"severity": severity, "title": title, "ago_s": age, "route": route, "count": 1}

    for a in approvals:
        title = str(a.get("title") or "Approval waiting").strip()
        add("approval:" + title.lower(), "critical", title, a.get("created_at"), "/tasks")
    for s in failed_schedules:
        name = str(s.get("name") or s.get("job_key") or "job").strip()
        add("cron:" + name.lower(), "warning", f"Cron: {name} failed", s.get("last_run_at"), "/cron-manager")
    # Een goedkeuring staat óók als melding in de feed ("Yes needed: DEAL-002 — ...: Deal: ...").
    # Die tweede kopie is geen nieuw nieuws; de goedkeuring zelf is de bron en wint.
    approval_titles = [str(a.get("title") or "").strip().lower() for a in approvals if a.get("title")]
    for n in notifications:
        msg = str(n.get("message") or "").strip().split("\n")[0]
        if not msg or any(t and msg.lower().startswith(t) for t in approval_titles):
            continue
        kind = str(n.get("type") or "").lower()
        severity = "critical" if kind in ("error", "critical") else "warning" if kind == "warning" else "info"
        add("note:" + msg.lower()[:80], severity, msg[:90], n.get("created_at"), "/")

    return sorted(
        items.values(),
        key=lambda i: (SEVERITY[i["severity"]], i["ago_s"] if i["ago_s"] is not None else 10**9),
    )


# ── Samenstellen ───────────────────────────────────────────────────────────────────

class TTLCache:
    """Een eenvoudige tijdcache. Eén exemplaar per proces; de VPS draait er twee workers, dus
    een koers wordt hooguit twee keer per TTL gehaald, wat ver onder de 8 credits per minuut blijft."""

    def __init__(self, klok: Callable[[], float] = time.monotonic) -> None:
        self._klok = klok
        self._data: dict[str, tuple[float, Any]] = {}

    async def get(
        self,
        key: str,
        ttl: float,
        fetch: Callable[[], Awaitable[Any]],
        bewaar: Callable[[Any], bool] | None = None,
    ) -> Any:
        now = self._klok()
        hit = self._data.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
        value = await fetch()
        if bewaar is None or bewaar(value):
            self._data[key] = (now, value)
            return value
        # Lege of stale feed: de oude goede waarde blijft staan, de nieuwe gaat wel terug
        # naar de beller (die zelf last-good per symbool al heeft ingevuld).
        return value


def machine_row(machine_id: str, name: str, metrics: Optional[dict]) -> dict:
    """Een machine als het scherm hem toont. `metrics=None` betekent: niet bereikt, dus offline."""
    if metrics is None:
        return {"id": machine_id, "name": name, "online": False, "cpu": None, "mem": None, "disk": None}
    return {"id": machine_id, "name": name, "online": True, **{k: metrics.get(k) for k in ("cpu", "mem", "disk")}}


def service_row(service_id: str, name: str, ok: Optional[bool], detail: str = "") -> dict:
    return {"id": service_id, "name": name, "ok": ok, "detail": detail}


def assemble(markets: list[dict], systems: list[dict], services: list[dict], attention: list[dict],
             now: datetime) -> dict:
    return {
        "generated_at": now.isoformat(),
        "markets": markets,
        "systems": systems,
        "services": services,
        "attention": attention,
        "attention_total": sum(i["count"] for i in attention),
    }


async def run_blocking(fn: Callable[..., Any], *args: Any) -> Any:
    return await asyncio.get_running_loop().run_in_executor(None, fn, *args)
