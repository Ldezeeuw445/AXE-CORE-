"""Trade journal analytics — the deliverable behind the trading_tools cluster.

Reads a broker CSV of closed trades and returns a descriptive report: what the
trades actually did, sliced the ways that usually reveal where the money went.

Two rules this file does not break:

1. **It describes, it never advises.** Output is "Friday: -0.42R over 31
   trades", never "stop trading Fridays". The moment a tool tells someone what
   to trade it is advice, which is licensed activity — and it is also the point
   where it stops being trustworthy. Every number here is a fact about data the
   user already owns.
2. **It never invents a number.** Missing stop-losses mean no true R-multiple,
   so it says so and falls back to a clearly-labelled proxy instead of quietly
   making one up.

Stdlib only — it has to run on a buyer's laptop with no install step.
"""

from __future__ import annotations

import csv
import io
import math
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable, Optional, Sequence

# Broker exports never agree on header names. These are the ones seen in MT4/
# MT5 statements, cTrader, TradingView's list, and most journal apps.
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "symbol": ("symbol", "instrument", "ticker", "pair", "market", "item"),
    "side": ("side", "direction", "type", "action", "buy/sell", "position"),
    "size": ("size", "volume", "lots", "quantity", "qty", "units", "amount"),
    "entry_price": ("entry", "entry price", "open price", "price open", "openprice", "avg entry"),
    "exit_price": ("exit", "exit price", "close price", "price close", "closeprice", "avg exit"),
    "stop_price": ("stop", "stop loss", "s/l", "sl", "stoploss", "stop price"),
    "opened_at": ("open time", "opened", "entry time", "open date", "time open", "date"),
    "closed_at": ("close time", "closed", "exit time", "close date", "time close"),
    "pnl": ("pnl", "p/l", "profit", "net profit", "realized pnl", "result", "profit/loss", "gross profit"),
    "fees": ("commission", "fees", "swap", "cost", "charges"),
}

DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%m/%d/%Y",
    "%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M",
)

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


class JournalError(ValueError):
    """The CSV cannot be read as a trade journal."""


@dataclass
class Trade:
    pnl: float
    symbol: str = ""
    side: str = ""
    size: Optional[float] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    stop_price: Optional[float] = None
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    fees: float = 0.0

    @property
    def net(self) -> float:
        return self.pnl

    @property
    def hold_minutes(self) -> Optional[float]:
        if self.opened_at and self.closed_at:
            return max((self.closed_at - self.opened_at).total_seconds() / 60.0, 0.0)
        return None

    def planned_risk(self, point_value: float = 1.0) -> Optional[float]:
        """Money at risk at entry, when a stop and size are both present.

        `point_value` converts price movement into account currency. It cannot
        be assumed to be 1: on FX and futures a 0.0010 stop on 1 lot is not
        $0.0010 of risk, and treating it as such produces R-multiples in the
        hundreds. See `implied_point_value()` — it is derived from the file's
        own trades rather than guessed.
        """
        if self.stop_price is None or self.entry_price is None or self.size is None:
            return None
        risk = abs(self.entry_price - self.stop_price) * self.size * point_value
        return risk if risk > 0 else None


# ── parsing ───────────────────────────────────────────────────────────────────

def _norm(header: str) -> str:
    return header.strip().lower().replace("_", " ")


def map_columns(headers: Sequence[str]) -> dict[str, str]:
    """Map our field names onto this file's headers. Exact alias match first,
    then a contains-match, so 'Profit (USD)' still finds 'profit'."""
    found: dict[str, str] = {}
    normalized = {_norm(h): h for h in headers}
    for field_name, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                found[field_name] = normalized[alias]
                break
        if field_name in found:
            continue
        for norm_header, original in normalized.items():
            if any(alias in norm_header for alias in aliases):
                found[field_name] = original
                break
    return found


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    # Strip currency symbols, thousands separators, and parenthesised negatives.
    negative = text.startswith("(") and text.endswith(")")
    for ch in "()$€£¥ ":
        text = text.replace(ch, "")
    text = text.replace(" ", "")
    if text.count(",") and text.count("."):
        text = text.replace(",", "")          # 1,234.56
    elif text.count(",") == 1 and text.count(".") == 0:
        text = text.replace(",", ".")         # 1234,56 (EU decimal comma)
    else:
        text = text.replace(",", "")
    try:
        number = float(text)
    except ValueError:
        return None
    return -number if negative else number


def _to_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_trades(csv_text: str) -> tuple[list[Trade], list[str]]:
    """Parse a broker CSV. Returns (trades, notes) — notes explain anything
    that was skipped or inferred, because a silent drop of 40 rows would
    quietly change every number in the report."""
    if not csv_text.strip():
        raise JournalError("the file is empty")

    try:
        dialect = csv.Sniffer().sniff(csv_text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel  # single-column or odd file; let DictReader try
    reader = csv.DictReader(io.StringIO(csv_text), dialect=dialect)
    headers = reader.fieldnames or []
    if not headers:
        raise JournalError("no header row found")

    cols = map_columns(headers)
    if "pnl" not in cols:
        raise JournalError(
            "no profit/loss column found. Expected one of: "
            + ", ".join(COLUMN_ALIASES["pnl"])
            + f". Found: {', '.join(headers)}"
        )

    notes: list[str] = []
    trades: list[Trade] = []
    skipped = 0
    for row in reader:
        pnl = _to_float(row.get(cols["pnl"]))
        if pnl is None:
            skipped += 1
            continue
        fees = _to_float(row.get(cols.get("fees", ""), "")) or 0.0
        trades.append(
            Trade(
                pnl=pnl,
                symbol=str(row.get(cols.get("symbol", ""), "") or "").strip(),
                side=str(row.get(cols.get("side", ""), "") or "").strip().lower(),
                size=_to_float(row.get(cols.get("size", ""), "")),
                entry_price=_to_float(row.get(cols.get("entry_price", ""), "")),
                exit_price=_to_float(row.get(cols.get("exit_price", ""), "")),
                stop_price=_to_float(row.get(cols.get("stop_price", ""), "")),
                opened_at=_to_dt(row.get(cols.get("opened_at", ""), "")),
                closed_at=_to_dt(row.get(cols.get("closed_at", ""), "")),
                fees=fees,
            )
        )

    if not trades:
        raise JournalError("no rows with a readable profit/loss value")
    if skipped:
        notes.append(f"{skipped} row(s) skipped — no readable profit/loss value")
    for field_name in ("stop_price", "opened_at", "closed_at", "size"):
        if field_name not in cols:
            notes.append(f"no '{field_name}' column — the slices that need it are omitted")
    return trades, notes


# ── metrics ───────────────────────────────────────────────────────────────────

def _bucket_stats(trades: Sequence[Trade], r_unit: Optional[float]) -> dict[str, Any]:
    pnls = [t.net for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    total = sum(pnls)
    return {
        "trades": len(trades),
        "net": round(total, 2),
        "win_rate": round(len(wins) / len(pnls), 4) if pnls else 0.0,
        "avg_win": round(statistics.mean(wins), 2) if wins else 0.0,
        "avg_loss": round(statistics.mean(losses), 2) if losses else 0.0,
        "expectancy": round(total / len(pnls), 2) if pnls else 0.0,
        # R per trade, not total R: buckets have very different sample sizes and
        # only a per-trade figure compares across them.
        "r_per_trade": round((total / len(pnls)) / r_unit, 2) if r_unit and pnls else None,
    }


def implied_point_values(trades: Sequence[Trade]) -> dict[str, float]:
    """Account currency per unit of price movement per unit of size, derived
    per symbol from the trades themselves.

    For every trade where entry, exit, size and P&L are known, the ratio
    `pnl / (price_move × size)` is that instrument's point value. It MUST be
    computed per symbol: in a journal holding both EURUSD and NAS100 the two
    values differ by five orders of magnitude, and a single global median makes
    every FX R-multiple meaningless.

    Symbols with too few usable rows are simply absent from the result — the
    caller then falls back to the labelled proxy instead of inventing a value.
    """
    ratios: dict[str, list[float]] = defaultdict(list)
    for t in trades:
        if t.entry_price is None or t.exit_price is None or not t.size:
            continue
        move = t.exit_price - t.entry_price
        if move == 0:
            continue
        direction = -1.0 if t.side.startswith("s") else 1.0
        denominator = move * direction * t.size
        if denominator == 0:
            continue
        ratio = t.pnl / denominator
        # A negative ratio means the recorded side disagrees with the sign of
        # the P&L (mislabelled shorts are common in exports). Drop it rather
        # than let it drag the median.
        if ratio > 0:
            ratios[t.symbol or "*"].append(ratio)
    return {
        symbol: statistics.median(values)
        for symbol, values in ratios.items()
        if len(values) >= 3
    }


def planned_risks(trades: Sequence[Trade]) -> list[float]:
    """Per-trade money at risk, each converted with its own symbol's point
    value so a mixed-instrument journal stays in one currency unit."""
    values = implied_point_values(trades)
    out: list[float] = []
    for t in trades:
        pv = values.get(t.symbol or "*")
        if pv is None:
            continue
        risk = t.planned_risk(pv)
        if risk:
            out.append(risk)
    return out


def risk_unit(trades: Sequence[Trade]) -> tuple[Optional[float], str]:
    """The denominator for R-multiples.

    Prefers real planned risk (stop distance × size × that symbol's point
    value). Falls back to the average losing trade, clearly labelled — that is
    a proxy, not an R, and calling it one would be the exact kind of invented
    number this tool exists to expose in other people's spreadsheets.
    """
    planned = planned_risks(trades)
    if len(planned) >= max(5, len(trades) // 4):
        n_symbols = len(implied_point_values(trades))
        return (
            statistics.median(planned),
            f"median planned risk (stop × size × point value, derived per symbol "
            f"across {n_symbols} instrument(s))",
        )
    losses = [abs(t.net) for t in trades if t.net < 0]
    if losses:
        return statistics.mean(losses), "average losing trade (PROXY — no usable stop data)"
    return None, "unavailable — no stops and no losing trades"


def analyse(trades: Sequence[Trade]) -> dict[str, Any]:
    pnls = [t.net for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    gross_win, gross_loss = sum(wins), abs(sum(losses))
    unit, unit_basis = risk_unit(trades)

    # Streaks
    longest_loss_streak = streak = 0
    for p in pnls:
        streak = streak + 1 if p < 0 else 0
        longest_loss_streak = max(longest_loss_streak, streak)

    # Concentration: how much of the damage sits in the worst 5% of trades.
    ordered = sorted(pnls)
    worst_n = max(1, math.ceil(len(ordered) * 0.05))
    worst_slice = ordered[:worst_n]

    by_weekday: dict[str, list[Trade]] = defaultdict(list)
    by_hour: dict[int, list[Trade]] = defaultdict(list)
    by_symbol: dict[str, list[Trade]] = defaultdict(list)
    by_hold: dict[str, list[Trade]] = defaultdict(list)
    for t in trades:
        when = t.opened_at or t.closed_at
        if when:
            by_weekday[WEEKDAYS[when.weekday()]].append(t)
            by_hour[when.hour].append(t)
        if t.symbol:
            by_symbol[t.symbol].append(t)
        mins = t.hold_minutes
        if mins is not None:
            label = (
                "< 5 min" if mins < 5 else
                "5–30 min" if mins < 30 else
                "30–120 min" if mins < 120 else
                "2–8 h" if mins < 480 else
                "8–24 h" if mins < 1440 else
                "> 1 day"
            )
            by_hold[label].append(t)

    return {
        "overall": {
            "trades": len(trades),
            "net": round(sum(pnls), 2),
            "fees": round(sum(t.fees for t in trades), 2),
            "win_rate": round(len(wins) / len(pnls), 4),
            "avg_win": round(statistics.mean(wins), 2) if wins else 0.0,
            "avg_loss": round(statistics.mean(losses), 2) if losses else 0.0,
            "largest_win": round(max(pnls), 2),
            "largest_loss": round(min(pnls), 2),
            "profit_factor": round(gross_win / gross_loss, 2) if gross_loss else None,
            "expectancy_per_trade": round(sum(pnls) / len(pnls), 2),
            "longest_losing_streak": longest_loss_streak,
        },
        "risk_unit": {"value": round(unit, 2) if unit else None, "basis": unit_basis},
        "expectancy_r": round((sum(pnls) / len(pnls)) / unit, 3) if unit else None,
        "concentration": {
            "worst_trades_counted": worst_n,
            "worst_slice_total": round(sum(worst_slice), 2),
            "share_of_gross_loss": (
                round(abs(sum(worst_slice)) / gross_loss, 4) if gross_loss else None
            ),
        },
        "by_weekday": {
            day: _bucket_stats(by_weekday[day], unit)
            for day in WEEKDAYS if day in by_weekday
        },
        "by_hour": {
            f"{h:02d}:00": _bucket_stats(by_hour[h], unit) for h in sorted(by_hour)
        },
        "by_symbol": dict(
            sorted(
                ((s, _bucket_stats(g, unit)) for s, g in by_symbol.items()),
                key=lambda kv: kv[1]["net"],
            )
        ),
        "by_hold_time": {k: _bucket_stats(v, unit) for k, v in by_hold.items()},
    }


# ── report ────────────────────────────────────────────────────────────────────

def _table(title: str, rows: dict[str, dict[str, Any]], currency: str) -> list[str]:
    if not rows:
        return []
    out = [f"### {title}", "",
           "| | trades | net | win rate | expectancy | R/trade |",
           "|---|---:|---:|---:|---:|---:|"]
    for label, s in rows.items():
        r = f"{s['r_per_trade']:+.2f}R" if s["r_per_trade"] is not None else "—"
        out.append(
            f"| {label} | {s['trades']} | {currency}{s['net']:,.2f} | "
            f"{s['win_rate']*100:.0f}% | {currency}{s['expectancy']:,.2f} | {r} |"
        )
    out.append("")
    return out


def report(trades: Sequence[Trade], notes: Sequence[str] = (), currency: str = "$") -> str:
    """The markdown deliverable. Descriptive only — no recommendations, by
    design; see the module docstring."""
    a = analyse(trades)
    o = a["overall"]
    lines = [
        "# Trade journal report",
        "",
        f"**{o['trades']} closed trades** · net **{currency}{o['net']:,.2f}** "
        f"· win rate **{o['win_rate']*100:.1f}%** "
        + (f"· profit factor **{o['profit_factor']}**" if o["profit_factor"] else "· profit factor n/a"),
        "",
        "## Headline numbers",
        "",
        f"- Expectancy per trade: **{currency}{o['expectancy_per_trade']:,.2f}**"
        + (f" (**{a['expectancy_r']:+.3f}R**)" if a["expectancy_r"] is not None else ""),
        f"- Average win {currency}{o['avg_win']:,.2f} vs average loss {currency}{o['avg_loss']:,.2f}",
        f"- Largest win {currency}{o['largest_win']:,.2f} · largest loss {currency}{o['largest_loss']:,.2f}",
        f"- Longest losing streak: {o['longest_losing_streak']} trades",
        f"- Fees paid: {currency}{o['fees']:,.2f}",
        f"- R unit used: {currency}{a['risk_unit']['value']:,.2f} — {a['risk_unit']['basis']}"
        if a["risk_unit"]["value"] else "- R unit: unavailable",
        "",
    ]

    c = a["concentration"]
    if c["share_of_gross_loss"] is not None:
        lines += [
            "## Loss concentration",
            "",
            f"The worst {c['worst_trades_counted']} trade(s) account for "
            f"**{c['share_of_gross_loss']*100:.0f}%** of gross losses "
            f"({currency}{c['worst_slice_total']:,.2f}).",
            "",
        ]

    lines += _table("By weekday", a["by_weekday"], currency)
    lines += _table("By entry hour", a["by_hour"], currency)
    lines += _table("By holding time", a["by_hold_time"], currency)
    lines += _table("By symbol (worst first)", a["by_symbol"], currency)

    lines += [
        "## How to read this",
        "",
        "Every figure above is a description of trades that already happened. "
        "None of it is a prediction or a recommendation — a slice being negative "
        "over a small sample is frequently noise, and the sample sizes are in the "
        "`trades` column for exactly that reason.",
        "",
    ]
    if notes:
        lines += ["## Notes on your file", ""] + [f"- {n}" for n in notes] + [""]
    return "\n".join(lines)


def report_from_csv(csv_text: str, currency: str = "$") -> str:
    trades, notes = parse_trades(csv_text)
    return report(trades, notes, currency=currency)
