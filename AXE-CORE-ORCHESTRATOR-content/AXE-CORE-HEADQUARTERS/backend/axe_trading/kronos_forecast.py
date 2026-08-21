#!/usr/bin/env python3
"""
kronos_forecast — AXE Algo's Kronos engine (self-test + live signal).

Fourth framework, and the first one that FORECASTS rather than reacts.

Kronos (github.com/shiyu-coder/Kronos) is a foundation model for candlesticks:
a tokenizer turns OHLCV into discrete tokens, a decoder-only transformer
continues the sequence. Trained on 45 exchanges. You hand it a lookback window
and it writes the next N bars.

ONE STRATEGY, NOT FOUR
Every other framework here exposes several strategies because it genuinely has
several — different entries, different exits. Kronos has one model producing
one forecast. Splitting that into "kr:trend", "kr:reversal" and so on would be
inventing strategies the framework does not have, exactly as TradingAgents
emits a single ta:debate because the firm reaches a single decision. So: one
name, kr:forecast, and the ledger ranks it against everything else on its
record.

A FORECAST IS NOT A SIGNAL
The model returns prices, not buy/sell. The translation is deliberate and
conservative: the median of the sampled forecast closes over the horizon, and
a move that clears a fraction of ATR counts. Anything smaller is inside the
noise the model was trained on, and trading it would be trading the sampler.
The threshold is in ATR rather than percent so it means the same thing on gold
at 4500 and on EURUSD at 1.16.

CPU, AND THAT SHAPES EVERYTHING
The VPS has six cores, no GPU, and about 2 GB of RAM free. Kronos-small
(24.7M) fits; base (102M) does not, comfortably. Sampling is the expensive
part, so T/top_p/sample_count are kept modest and the walk-forward self-test
covers a bounded window rather than every bar — a backtest that cannot finish
inside the API's timeout produces no ledger row at all, which is worse than a
smaller honest one.

Runs in its own venv (/opt/axe-kronos/venv) for the same reason the others do:
torch's own dependency tree must never be able to break vectorbt or Nautilus.
Called by the API's /backtest/kronos and /signal/kronos.

Usage: kronos_forecast.py <SYMBOL> [interval=1h] [outputsize=512] [mode=backtest|signal]
"""
import json
import os
import sys

MODEL_DIR = os.environ.get("KRONOS_MODEL_DIR", "/opt/axe-kronos/models")
MODEL_NAME = os.environ.get("KRONOS_MODEL", "NeoQuasar/Kronos-small")
TOKENIZER_NAME = os.environ.get("KRONOS_TOKENIZER", "NeoQuasar/Kronos-Tokenizer-base")

# How far ahead the model writes, and how much of an ATR a move must clear
# before it is worth acting on.
HORIZON = 12
ATR_THRESHOLD = 0.35
# Sampling. Higher sample_count is a steadier median and linearly more CPU.
SAMPLE_COUNT = 5
TEMPERATURE = 1.0
TOP_P = 0.9
# Bars of context fed to the model. Kronos-small handles 512.
LOOKBACK = 400

TD_MAP = {
    "XAUUSD": "XAU/USD", "XAGUSD": "XAG/USD", "EURUSD": "EUR/USD",
    "GBPUSD": "GBP/USD", "USDJPY": "USD/JPY", "USDCHF": "USD/CHF",
    "AUDUSD": "AUD/USD", "NZDUSD": "NZD/USD", "USDCAD": "USD/CAD",
    "BTCUSD": "BTC/USD", "ETHUSD": "ETH/USD", "LTCUSD": "LTC/USD",
}


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)


def fetch_ohlc(symbol, interval, outputsize):
    """Same contract as the other engines, so the ledger cannot tell them apart."""
    import httpx
    import pandas as pd
    key = os.environ.get("TWELVEDATA_API_KEY", "").strip()
    if not key:
        fail("TWELVEDATA_API_KEY not set")
    td_symbol = TD_MAP.get(symbol.upper(), symbol.upper())
    r = httpx.get(
        "https://api.twelvedata.com/time_series",
        params={"symbol": td_symbol, "interval": interval,
                "outputsize": max(200, min(outputsize, 5000)),
                "apikey": key, "order": "ASC"},
        timeout=30,
    )
    data = r.json()
    if data.get("status") == "error":
        fail(f"TwelveData: {data.get('message', 'unknown error')}")
    values = data.get("values") or []
    if len(values) < 200:
        fail(f"only {len(values)} candles (need >=200)")
    df = pd.DataFrame(values)
    df["datetime"] = pd.to_datetime(df["datetime"])
    df = df.sort_values("datetime").set_index("datetime")
    for c in ("open", "high", "low", "close"):
        df[c] = df[c].astype(float)
    df["volume"] = df["volume"].astype(float) if "volume" in df else 1.0
    return df[["open", "high", "low", "close", "volume"]]


def atr(df, n=14):
    import pandas as pd
    prev = df["close"].shift(1)
    tr = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


_predictor = None


def predictor():
    """Loaded once per process. The API runs this as a subprocess per call, so
    'once' means once per request — the model is small enough that this costs
    seconds, and it keeps a wedged inference from outliving its own process."""
    global _predictor
    if _predictor is not None:
        return _predictor
    try:
        from model import Kronos, KronosTokenizer, KronosPredictor
    except ImportError:
        fail("kronos package not importable — /opt/axe-kronos not installed")
    try:
        tok = KronosTokenizer.from_pretrained(TOKENIZER_NAME, cache_dir=MODEL_DIR)
        mdl = Kronos.from_pretrained(MODEL_NAME, cache_dir=MODEL_DIR)
        _predictor = KronosPredictor(mdl, tok, device="cpu", max_context=512)
    except Exception as e:
        fail(f"kronos model load failed: {type(e).__name__}: {str(e)[:200]}")
    return _predictor


def forecast_close(df, horizon=HORIZON):
    """Median forecast close at the end of the horizon, or None."""
    import pandas as pd
    p = predictor()
    hist = df.iloc[-LOOKBACK:] if len(df) > LOOKBACK else df
    x_df = hist[["open", "high", "low", "close", "volume"]].reset_index(drop=True)
    x_ts = pd.Series(hist.index)
    step = hist.index[-1] - hist.index[-2]
    y_ts = pd.Series([hist.index[-1] + step * (i + 1) for i in range(horizon)])
    try:
        out = p.predict(
            df=x_df, x_timestamp=x_ts, y_timestamp=y_ts, pred_len=horizon,
            T=TEMPERATURE, top_p=TOP_P, sample_count=SAMPLE_COUNT, verbose=False,
        )
    except Exception as e:
        fail(f"kronos predict failed: {type(e).__name__}: {str(e)[:200]}")
    if out is None or len(out) == 0:
        return None
    return float(out["close"].iloc[-1])


def to_signal(last_close, predicted, atr_now):
    """A forecast becomes a side only when it clears the noise floor."""
    if predicted is None or not atr_now or atr_now <= 0:
        return "hold", 0.0
    move = predicted - last_close
    if abs(move) < ATR_THRESHOLD * atr_now:
        return "hold", move / atr_now
    return ("buy" if move > 0 else "sell"), move / atr_now


def run(symbol, interval, outputsize, mode):
    df = fetch_ohlc(symbol, interval, outputsize)
    a = atr(df)
    last_close = float(df["close"].iloc[-1])
    atr_now = float(a.iloc[-1])

    if mode == "signal":
        pred = forecast_close(df)
        side, in_atr = to_signal(last_close, pred, atr_now)
        print(json.dumps({
            "ok": True, "symbol": symbol.upper(), "interval": interval,
            "bars": int(len(df)),
            # Same key the other engines use, so the autopilot reads all four
            # the same way.
            "signals": {"kr:forecast": side},
            "detail": {
                "last": last_close,
                "forecast": pred,
                "horizon": HORIZON,
                "move_in_atr": round(in_atr, 3),
                "threshold_atr": ATR_THRESHOLD,
                "model": MODEL_NAME,
            },
        }))
        return

    # ── walk-forward self-test ──
    #
    # Bounded on purpose. Each step is a full sampled forecast on CPU, so
    # covering every bar would not finish inside the API timeout and would
    # produce no ledger row at all. A smaller window that completes is worth
    # more than a thorough one that times out.
    steps = int(os.environ.get("KRONOS_BACKTEST_STEPS", "40"))
    wins = losses = 0
    rets = []
    start = max(LOOKBACK, len(df) - steps - HORIZON)
    for i in range(start, len(df) - HORIZON):
        window = df.iloc[:i]
        if len(window) < LOOKBACK // 2:
            continue
        close_i = float(df["close"].iloc[i - 1])
        atr_i = float(a.iloc[i - 1])
        pred = forecast_close(window)
        side, _ = to_signal(close_i, pred, atr_i)
        if side == "hold":
            continue
        actual = float(df["close"].iloc[i - 1 + HORIZON])
        pnl = (actual - close_i) if side == "buy" else (close_i - actual)
        rets.append(pnl / close_i * 100.0)
        if pnl > 0:
            wins += 1
        else:
            losses += 1

    trades = wins + losses
    net = sum(rets)
    gross_win = sum(r for r in rets if r > 0)
    gross_loss = -sum(r for r in rets if r < 0)
    print(json.dumps({
        "ok": True, "symbol": symbol.upper(), "interval": interval,
        "bars": int(len(df)),
        "strategies": {
            "kr:forecast": {
                "netReturnPct": round(net, 4),
                "trades": trades,
                "winRatePct": round(wins / trades * 100, 2) if trades else 0.0,
                "profitFactor": round(gross_win / gross_loss, 3) if gross_loss > 0 else 0.0,
                "maxDrawdownPct": round(min(rets), 4) if rets else 0.0,
                "sharpe": 0.0,
                "note": f"walk-forward, {steps} steps, horizon {HORIZON}, {MODEL_NAME} on CPU",
            }
        },
    }))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        fail("usage: kronos_forecast.py <SYMBOL> [interval] [outputsize] [mode]")
    run(
        sys.argv[1],
        sys.argv[2] if len(sys.argv) > 2 else "1h",
        int(sys.argv[3]) if len(sys.argv) > 3 else 512,
        sys.argv[4] if len(sys.argv) > 4 else "backtest",
    )
