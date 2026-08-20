#!/usr/bin/env python3
"""
tradingagents_engine — AXE Algo's TradingAgents engine (Tauric Research).

Third framework, same contract as vectorbt and Nautilus: `signal` and
`backtest`, one JSON object on stdout, strategies named with its own prefix so
the ledger cannot tell the engines apart.

WHAT IT IS, AND WHY IT IS NOT SHAPED LIKE THE OTHER TWO

vectorbt and Nautilus are strategy libraries: indicators in, fills out, and a
thousand bars cost a second. TradingAgents is a firm. It runs seven LLM roles
-- fundamentals, sentiment, news, technicals, a bull and a bear who argue, a
risk manager and a trader -- and returns ONE decision with a rationale, a stop
and a target.

That difference is the whole integration problem, so it is worth stating
plainly rather than discovering later:

  * One decision costs a real LLM conversation. On this box's local Ollama that
    is minutes, not the ~1 second a Nautilus sweep takes.
  * So it cannot be swept across four timeframes and every pair on a twelve
    hour self-test the way the other two are. Its backtest is a small
    walk-forward -- a handful of dates, each a full debate -- and it is priced
    in minutes. Everything about how it is scheduled follows from that.
  * It emits one strategy, `ta:debate`, not four. Splitting the roles into
    separate ledger rows would be inventing strategies the framework does not
    have.

WHY OLLAMA AND NOT A CLOUD KEY

The provider keys for this project live in the app, never on the VPS -- that is
a deliberate rule from the packaged-Tauri work, and putting a paid key on the
box to satisfy a backtest would quietly undo it. This box already runs its own
Ollama with eight models, so the debate runs locally, costs no quota, and
cannot be broken by a revoked key. That is also why it is safe for the autopilot
to call: a framework that could burn Gemini quota per decision would be a
liability rather than a candidate.

Runs in its own venv (/opt/axe-tradingagents/venv). See README.md.

Usage: tradingagents_engine.py <SYMBOL> [interval=1h] [outputsize] [mode] [dates]
"""
import sys
import os
import json
import warnings

warnings.filterwarnings("ignore")

if sys.version_info < (3, 11):
    print(json.dumps({"ok": False, "error": f"needs python>=3.11, have {sys.version_info.major}.{sys.version_info.minor}"}))
    sys.exit(0)

STRATEGY = "ta:debate"

# Decisions are CACHED, and that is not an optimisation -- it is the only way
# this framework can take part at all.
#
# Measured on this box 2026-08-20: one full debate runs well past four minutes,
# on hermes3:8b AND on llama3.2:3b. The model size is not the cost; the debate
# is many sequential tool-using LLM calls. A live signal path that waits for
# that would stall the whole autopilot cycle, and capping it lower just means
# the ledger promotes ta:debate and then every signal times out into "hold" --
# a framework that is wired, ranked, and silently never trades. This project
# has shipped that shape three times.
#
# So: `refresh` runs the debate and writes the answer down. `signal` reads it
# and never calls a model. The cache lives a day, which matches the horizon the
# firm actually reasons over.
CACHE_DIR = os.environ.get("AXE_TA_CACHE", "/opt/axe-tradingagents/cache")
CACHE_TTL_SECONDS = 24 * 60 * 60

# TradingAgents reads market data through yfinance, which does not use MT5
# symbols. Metals map to the front-month future rather than the spot pair,
# because that is the series yfinance actually carries history for.
YF_MAP = {
    "XAUUSD": "GC=F", "XAGUSD": "SI=F", "WTIUSD": "CL=F",
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "JPY=X",
    "USDCHF": "CHF=X", "AUDUSD": "AUDUSD=X", "NZDUSD": "NZDUSD=X", "USDCAD": "CAD=X",
    "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD",
    "US30": "^DJI", "US500": "^GSPC", "NAS100": "^IXIC",
    "GER40": "^GDAXI", "UK100": "^FTSE",
}

# Local Ollama on this box. hermes3:8b is already the model the nightly
# conversation review uses, so it is known to work here; llama3.2:3b handles
# the cheap turns so a debate does not spend an 8B model on scaffolding.
OLLAMA_URL = os.environ.get("AXE_TA_OLLAMA", "http://127.0.0.1:11434")
DEEP_MODEL = os.environ.get("AXE_TA_DEEP_MODEL", "hermes3:8b")
QUICK_MODEL = os.environ.get("AXE_TA_QUICK_MODEL", "llama3.2:3b")


def coverage(yf_symbol: str) -> dict:
    """Which of the firm's analysts can actually work on this instrument.

    Measured 2026-08-20 on the box: a EURUSD run logged
    "No earnings dates found, symbol may be delisted" and repeated 404s for
    "No fundamentals data found for symbol: EURUSD=X". That is not a bug to
    fix -- a currency pair HAS no earnings, no insider trades and no balance
    sheet. Neither does gold, an index, or Bitcoin.

    TradingAgents is built for equities, and AXE's universe is FX, metals,
    indices and crypto. So on almost every symbol this desk trades, the
    fundamentals analyst is structurally blind and only the technical, news and
    sentiment roles contribute. The debate still runs and still reaches a
    decision -- it is simply a thinner one than the framework is capable of,
    and that has to travel WITH the answer rather than being folded into a
    number on a scorecard.
    """
    non_equity = (
        yf_symbol.endswith("=X")      # FX pair
        or yf_symbol.endswith("=F")   # future (gold, silver, oil)
        or yf_symbol.startswith("^")  # index
        or yf_symbol.endswith("-USD") # crypto
    )
    if non_equity:
        return {
            "level": "partial",
            "note": "no fundamentals, earnings or insider data exist for this instrument — technicals, news and sentiment only",
        }
    return {"level": "full", "note": "all analysts have data"}


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)


def to_yf(symbol: str) -> str:
    s = symbol.upper()
    if s in YF_MAP:
        return YF_MAP[s]
    # A six-letter FX pair we have not mapped still follows yfinance's rule.
    if len(s) == 6 and s.isalpha():
        return f"{s}=X"
    return s


def build_graph(debate_rounds: int):
    from tradingagents.config import TradingAgentsConfig, set_config
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    os.environ.setdefault("OLLAMA_BASE_URL", OLLAMA_URL)
    cfg = TradingAgentsConfig(
        llm_provider="ollama",
        deep_think_llm=DEEP_MODEL,
        quick_think_llm=QUICK_MODEL,
        # One round. Each additional round is another full pass of the bull and
        # bear arguing, which on a local 8B model is minutes of wall clock for a
        # decision the ledger scores identically either way.
        max_debate_rounds=debate_rounds,
        max_risk_discuss_rounds=1,
        # 30 is the library's own floor -- it validates >= 30 and refuses
        # anything lower. Found by running it rather than by reading, which is
        # why this number is not a guess.
        max_recur_limit=30,
        results_dir="/tmp/axe-tradingagents",
    )
    # Both: set_config for the module-level readers inside the library, and the
    # explicit argument because the graph is a pydantic model with `config` as a
    # required field -- set_config alone leaves it empty and it refuses to build.
    set_config(cfg)
    return TradingAgentsGraph(config=cfg)


def decide(graph, yf_symbol: str, date_str: str) -> dict:
    """One full debate -> a normalised decision."""
    _state, rec = graph.propagate(yf_symbol, date_str)
    signal = str(getattr(rec, "signal", "HOLD")).upper()
    return {
        "signal": "buy" if signal == "BUY" else "sell" if signal == "SELL" else "hold",
        "confidence": float(getattr(rec, "confidence", 0.0) or 0.0),
        "stopLoss": getattr(rec, "stop_loss", None),
        "targetPrice": getattr(rec, "target_price", None),
        "horizonDays": getattr(rec, "time_horizon_days", None),
        "rationale": (getattr(rec, "rationale", "") or "")[:1200],
        "coverage": coverage(yf_symbol),
    }


def cache_path(symbol: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"{symbol.upper()}.json")


def run_refresh(symbol: str, interval: str):
    """Run the debate and write the answer down. Slow by nature; scheduled."""
    from datetime import date, datetime, timezone
    graph = build_graph(debate_rounds=1)
    d = decide(graph, to_yf(symbol), date.today().isoformat())
    d["at"] = datetime.now(timezone.utc).isoformat()
    with open(cache_path(symbol), "w") as fh:
        json.dump(d, fh)
    print(json.dumps({
        "ok": True, "symbol": symbol.upper(), "interval": interval, "bars": 0,
        "refreshed": True,
        "signals": {STRATEGY: d["signal"]},
        "detail": {STRATEGY: d},
    }))


def run_signal(symbol: str, interval: str):
    """Read the last decision. Never calls a model, so it answers instantly.

    A missing or expired cache is reported as `hold` with a reason rather than
    as an error: the autopilot already treats hold as "no opinion", and a
    framework with nothing to say must not be able to fail a trading cycle.
    """
    from datetime import datetime, timezone
    try:
        with open(cache_path(symbol)) as fh:
            d = json.load(fh)
    except (OSError, ValueError):
        d = None

    stale_reason = None
    if d is None:
        stale_reason = "no decision cached yet — /refresh/tradingagents has not run for this symbol"
    else:
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(d["at"])).total_seconds()
        except Exception:
            age = CACHE_TTL_SECONDS + 1
        if age > CACHE_TTL_SECONDS:
            stale_reason = f"cached decision is {int(age // 3600)}h old"
            d = {**d, "ageSeconds": int(age)}

    signal = "hold" if (d is None or stale_reason) else d["signal"]
    print(json.dumps({
        "ok": True, "symbol": symbol.upper(), "interval": interval, "bars": 0,
        "cached": True,
        "stale": stale_reason,
        "signals": {STRATEGY: signal},
        "detail": {STRATEGY: d} if d else {},
    }))


def run_backtest(symbol: str, interval: str, dates: int):
    """Walk forward over a few dates and score each decision on what actually
    happened next.

    Deliberately small. Every date here is a full multi-agent debate, so this
    is priced in minutes -- the honest alternative to pretending a thousand-bar
    sweep is possible."""
    import pandas as pd
    import yfinance as yf
    from datetime import timedelta

    yf_symbol = to_yf(symbol)
    hist = yf.download(yf_symbol, period="6mo", interval="1d", progress=False, auto_adjust=True)
    if hist is None or hist.empty or len(hist) < 40:
        fail(f"no yfinance history for {yf_symbol}")
    close = hist["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]

    # Evenly spaced decision dates, each with room for the horizon to play out.
    HORIZON = 5
    usable = close.index[20:-HORIZON]
    if len(usable) < dates:
        dates = max(1, len(usable))
    step = max(1, len(usable) // dates)
    picks = list(usable[::step])[:dates]

    graph = build_graph(debate_rounds=1)
    # The newest decision in the walk-forward is today's answer, so the
    # backtest doubles as a cache refresh rather than paying for the same
    # debate twice.
    newest = None
    rets, errors = [], []
    for ts in picks:
        try:
            d = decide(graph, yf_symbol, pd.Timestamp(ts).date().isoformat())
        except Exception as e:
            errors.append(f"{type(e).__name__}: {str(e)[:80]}")
            continue
        newest = d
        if d["signal"] == "hold":
            continue
        entry = float(close.loc[ts])
        future = close.loc[ts:].iloc[: HORIZON + 1]
        if len(future) < 2 or entry <= 0:
            continue
        exit_px = float(future.iloc[-1])
        move = (exit_px - entry) / entry
        rets.append(move if d["signal"] == "buy" else -move)

    if newest is not None:
        from datetime import datetime, timezone
        try:
            newest = {**newest, "at": datetime.now(timezone.utc).isoformat()}
            with open(cache_path(symbol), "w") as fh:
                json.dump(newest, fh)
        except OSError:
            pass

    if not rets:
        print(json.dumps({
            "ok": True, "symbol": symbol.upper(), "interval": interval, "bars": int(len(close)),
            "strategies": {STRATEGY: {"error": "; ".join(errors)[:180] or "every decision was hold"}},
        }))
        return

    wins = [r for r in rets if r > 0]
    losses = [r for r in rets if r < 0]
    gross_loss = abs(sum(losses))
    equity, peak, dd = 1.0, 1.0, 0.0
    for r in rets:
        equity *= 1 + r
        peak = max(peak, equity)
        dd = max(dd, (peak - equity) / peak)
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / len(rets)
    sd = var ** 0.5

    print(json.dumps({
        "ok": True, "symbol": symbol.upper(), "interval": interval, "bars": int(len(close)),
        "strategies": {STRATEGY: {
            "netReturnPct": equity - 1.0,
            "winRate": len(wins) / len(rets),
            "profitFactor": min(sum(wins) / gross_loss, 99.0) if gross_loss > 0 else (99.0 if wins else 0.0),
            "trades": len(rets),
            "maxDrawdownPct": dd,
            "sharpe": (mean / sd * (len(rets) ** 0.5)) if sd > 0 else 0.0,
        }},
    }))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        fail("usage: tradingagents_engine.py <SYMBOL> [interval] [outputsize] [mode] [dates]")
    sym = sys.argv[1]
    itv = sys.argv[2] if len(sys.argv) > 2 else "1h"
    mode = sys.argv[4] if len(sys.argv) > 4 else "backtest"
    n_dates = int(sys.argv[5]) if len(sys.argv) > 5 else 4
    try:
        if mode == "signal":
            run_signal(sym, itv)
        elif mode == "refresh":
            run_refresh(sym, itv)
        else:
            run_backtest(sym, itv, n_dates)
    except SystemExit:
        raise
    except Exception as e:
        fail(f"{type(e).__name__}: {str(e)[:200]}")
