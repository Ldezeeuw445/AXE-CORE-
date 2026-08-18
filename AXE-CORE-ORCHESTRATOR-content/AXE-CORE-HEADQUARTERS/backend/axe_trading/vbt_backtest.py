#!/usr/bin/env python3
"""
vbt_backtest — AXE Algo's vectorbt engine (self-test + live signal).

Two modes over the SAME clean vbt:* strategies:
  * backtest (default): per-strategy metrics → ledger priors.
  * signal: each strategy's CURRENT buy/sell/hold on the latest bar → lets
    AXE Algo actually TRADE a vectorbt strategy the ledger picked, not just
    rank it. So the frameworks are real competitors, auto-selected and traded.

Runs in its own venv (/opt/axe-trading/venv). Called by the API's
/backtest/vectorbt and /signal/vectorbt endpoints.

Usage: vbt_backtest.py <SYMBOL> [interval=1h] [outputsize=1000] [mode=backtest|signal]
"""
import sys
import os
import json

TD_MAP = {
    "XAUUSD": "XAU/USD", "XAGUSD": "XAG/USD",
    "EURUSD": "EUR/USD", "GBPUSD": "GBP/USD", "USDJPY": "USD/JPY",
    "USDCHF": "USD/CHF", "AUDUSD": "AUD/USD", "NZDUSD": "NZD/USD", "USDCAD": "USD/CAD",
    "BTCUSD": "BTC/USD", "ETHUSD": "ETH/USD",
}


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)


def fetch_close(symbol, interval, outputsize):
    import httpx
    import pandas as pd
    key = os.environ.get("TWELVEDATA_API_KEY", "").strip()
    if not key:
        fail("TWELVEDATA_API_KEY not set")
    td_symbol = TD_MAP.get(symbol.upper(), symbol.upper())
    r = httpx.get(
        "https://api.twelvedata.com/time_series",
        params={"symbol": td_symbol, "interval": interval,
                "outputsize": max(120, min(outputsize, 5000)),
                "apikey": key, "order": "ASC"},
        timeout=30,
    )
    data = r.json()
    if data.get("status") == "error":
        fail(f"TwelveData: {data.get('message', 'unknown error')}")
    values = data.get("values") or []
    if len(values) < 120:
        fail(f"only {len(values)} candles (need >=120)")
    df = pd.DataFrame(values)
    df["datetime"] = pd.to_datetime(df["datetime"])
    df = df.sort_values("datetime").set_index("datetime")
    return df["close"].astype(float)


def signal_defs(close):
    """(name, entries, exits) for each vbt:* strategy over `close`. One place,
    used by both backtest and live-signal so they can never disagree."""
    import vectorbt as vbt
    out = []
    fast = vbt.MA.run(close, 10)
    slow = vbt.MA.run(close, 30)
    out.append(("vbt:ma-cross", fast.ma_crossed_above(slow.ma), fast.ma_crossed_below(slow.ma)))
    rsi = vbt.RSI.run(close, 14)
    out.append(("vbt:rsi-meanrev", rsi.rsi_below(30), rsi.rsi_above(55)))
    bb = vbt.BBANDS.run(close)
    out.append(("vbt:bbands", close.vbt < bb.lower, close.vbt > bb.middle))
    macd = vbt.MACD.run(close)
    out.append(("vbt:macd", macd.macd_above(macd.signal), macd.macd_below(macd.signal)))
    return out


def m(pf):
    def scalar(x, d=0.0):
        try:
            v = float(x)
            return v if v == v else d
        except Exception:
            return d
    trades = pf.trades
    n = int(scalar(trades.count(), 0))
    pf_val = scalar(trades.profit_factor(), 0.0) if n > 0 else 0.0
    return {
        "netReturnPct": scalar(pf.total_return(), 0.0),
        "winRate": scalar(trades.win_rate(), 0.0) if n > 0 else 0.0,
        "profitFactor": min(pf_val, 99.0),
        "trades": n,
        "maxDrawdownPct": abs(scalar(pf.max_drawdown(), 0.0)),
        "sharpe": scalar(pf.sharpe_ratio(), 0.0),
    }


def run(symbol, interval, outputsize, mode):
    import vectorbt as vbt
    close = fetch_close(symbol, interval, outputsize)
    freq = {"1h": "1H", "4h": "4H", "1d": "1D", "30min": "30T",
            "15min": "15T", "5min": "5T"}.get(interval, "1H")
    defs = signal_defs(close)

    if mode == "signal":
        sigs = {}
        for name, entries, exits in defs:
            try:
                buy = bool(entries.iloc[-1]) if hasattr(entries, "iloc") else bool(entries[-1])
                sell = bool(exits.iloc[-1]) if hasattr(exits, "iloc") else bool(exits[-1])
                sigs[name] = "buy" if buy else ("sell" if sell else "hold")
            except Exception as e:
                sigs[name] = "hold"
        print(json.dumps({"ok": True, "symbol": symbol.upper(), "interval": interval,
                          "bars": int(len(close)), "signals": sigs}))
        return

    out = {}
    for name, entries, exits in defs:
        try:
            pf = vbt.Portfolio.from_signals(close, entries, exits, freq=freq)
            out[name] = m(pf)
        except Exception as e:
            out[name] = {"error": str(e)[:120]}
    print(json.dumps({"ok": True, "symbol": symbol.upper(), "interval": interval,
                      "bars": int(len(close)), "strategies": out}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        fail("usage: vbt_backtest.py <SYMBOL> [interval] [outputsize] [mode]")
    sym = sys.argv[1]
    itv = sys.argv[2] if len(sys.argv) > 2 else "1h"
    osz = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
    md = sys.argv[4] if len(sys.argv) > 4 else "backtest"
    try:
        run(sym, itv, osz, md)
    except SystemExit:
        raise
    except Exception as e:
        fail(f"{type(e).__name__}: {str(e)[:200]}")
