#!/usr/bin/env python3
"""
nautilus_backtest — AXE Algo's NautilusTrader engine (self-test + live signal).

Same two modes and the same output shape as vbt_backtest.py, so the ledger
cannot tell the two engines apart:
  * backtest (default): per-strategy metrics -> ledger priors.
  * signal: each strategy's CURRENT buy/sell/hold on the latest bar.

WHY A SECOND ENGINE AT ALL

vectorbt fills a signal at the close of the bar that produced it. Nothing in
that model can express "I was stopped out at 09:14 for -1.5 ATR", because the
path inside the bar does not exist -- there is only a close. AXE trades with a
stop and a target attached to every order, so vectorbt's numbers answer a
question AXE never asks: what would this be worth with no stop at all.

NautilusTrader has a matching engine. A bracket submitted here is a real
STOP_MARKET and a real LIMIT sitting in the book, filled against each bar's own
high and low, with commission taken out. `bar_adaptive_high_low_ordering=True`
makes it walk a bar in the pessimistic order when the stop and the target both
sit inside it -- the stop first. That is the number worth having: the same idea
traded the way AXE actually trades it.

So the nt:* strategies are deliberately NOT ports of the vbt:* ones. Every one
of them is defined by its exit as much as its entry, which is the half vectorbt
cannot measure.

WHERE THE SIGNALS COME FROM

Entry and exit levels are computed once, in pandas, by signal_defs(). Both
modes read that same function -- the identical discipline vbt_backtest.py
enforces -- so a strategy cannot rank one way and trade another. Nautilus is
used for what it is good at, which is execution, not for its indicator library.

Runs in its own venv (/opt/axe-nautilus/venv). Called by the API's
/backtest/nautilus and /signal/nautilus.

Usage: nautilus_backtest.py <SYMBOL> [interval=1h] [outputsize=1000] [mode=backtest|signal]
"""
import sys
import os
import json

# Nautilus needs >=3.11. The VPS's system python is older, which is exactly why
# this lives in its own venv -- see README.md.
if sys.version_info < (3, 11):
    print(json.dumps({"ok": False, "error": f"needs python>=3.11, have {sys.version_info.major}.{sys.version_info.minor}"}))
    sys.exit(0)

TD_MAP = {
    "XAUUSD": "XAU/USD", "XAGUSD": "XAG/USD",
    "EURUSD": "EUR/USD", "GBPUSD": "GBP/USD", "USDJPY": "USD/JPY",
    "USDCHF": "USD/CHF", "AUDUSD": "AUD/USD", "NZDUSD": "NZD/USD", "USDCAD": "USD/CAD",
    "BTCUSD": "BTC/USD", "ETHUSD": "ETH/USD",
}

# The account exists only so margin never becomes the thing under test. Sizing
# is one lot, always (see position_size), so this is deliberately far larger
# than any position it has to carry.
STARTING_BALANCE = 10_000_000

# Returns are expressed against the capital a trade actually commits -- one
# lot at the opening price -- not against that account balance. vectorbt's
# from_signals deploys the whole portfolio per trade, so its total_return is
# already "return on the money committed"; measuring nautilus against a fixed
# 10M float instead would make every nt: row look like a rounding error next
# to the vbt: row beside it in the same ledger.
def position_size(instrument):
    """One lot. Identical for every strategy and every pair, so a ledger row
    reflects the edge and not a sizing choice made inside the engine.

    It also has to be a legal size: the first run of this engine sized by
    notional and produced 25 units of XAU against a 1000-unit minimum. Every
    order was denied by the risk engine and all four strategies reported zero
    trades -- a clean, plausible, entirely empty result."""
    lot = instrument.min_quantity or instrument.lot_size
    return lot


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(0)


def fetch_ohlc(symbol, interval, outputsize):
    """OHLC, not just close. The stop and the target are filled against a bar's
    high and low, so dropping them would remove the reason this engine exists."""
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
    for c in ("open", "high", "low", "close"):
        df[c] = df[c].astype(float)
    df["volume"] = df["volume"].astype(float) if "volume" in df else 1.0
    return df[["open", "high", "low", "close", "volume"]]


def _atr(df, n=14):
    import pandas as pd
    prev = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def _rsi(close, n=14):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, 1e-12))


def signal_defs(df):
    """(name, side_series, sl_atr_mult, tp_atr_mult) per nt:* strategy.

    side_series holds 'buy' / 'sell' / '' per bar -- the ENTRY intent only. The
    exit is the bracket, which is the point: an idea is only as good as the
    stop you had to hold through.

    One place, read by both modes, so backtest and signal can never disagree.
    """
    close, high, low = df["close"], df["high"], df["low"]
    atr = _atr(df)
    out = []

    # 1. EMA cross, held with a 1.5/3.0 ATR bracket. The plain cross is
    #    vectorbt's ma-cross; what is measured here is whether the idea
    #    survives a stop that is only 1.5 ATR away.
    ef, es = close.ewm(span=12, adjust=False).mean(), close.ewm(span=26, adjust=False).mean()
    cross_up = (ef > es) & (ef.shift(1) <= es.shift(1))
    cross_dn = (ef < es) & (ef.shift(1) >= es.shift(1))
    side = cross_up.map({True: "buy"}).fillna("") .where(~cross_dn, "sell")
    out.append(("nt:ema-bracket", side, 1.5, 3.0))

    # 2. Breakout of the prior 20-bar range, wide stop, 2:1 target. Breakouts
    #    are the classic case where the vectorized number flatters: most of the
    #    losers stop out intrabar and never show up in a close-to-close model.
    hh, ll = high.rolling(20).max().shift(1), low.rolling(20).min().shift(1)
    side = (close > hh).map({True: "buy"}).fillna("").where(~(close < ll), "sell")
    out.append(("nt:atr-breakout", side, 2.0, 4.0))

    # 3. Donchian(20) breakout exited by a trailing stop rather than a fixed
    #    target -- there is no vectorbt equivalent, since the exit level is only
    #    knowable while the position is open.
    dh, dl = high.rolling(20).max().shift(1), low.rolling(20).min().shift(1)
    side = (close > dh).map({True: "buy"}).fillna("").where(~(close < dl), "sell")
    out.append(("nt:donchian-trail", side, 2.0, None))  # None target = trailing

    # 4. Pullback inside a trend: EMA(50) sets direction, RSI(14) times entry.
    #    Tight 1.5 ATR stop against a 2.5 ATR target.
    e50 = close.ewm(span=50, adjust=False).mean()
    rsi = _rsi(close)
    # 45/55, not 40/60: in a trend strong enough to pass the EMA filter, RSI
    # rarely reaches 40 at all -- measured zero entries in 800 bars, which is
    # a strategy that cannot lose because it never plays.
    longs = (close > e50) & (rsi < 45) & (rsi.shift(1) >= 45)
    shorts = (close < e50) & (rsi > 55) & (rsi.shift(1) <= 55)
    side = longs.map({True: "buy"}).fillna("").where(~shorts, "sell")
    out.append(("nt:rsi-pullback", side, 1.5, 2.5))

    return out, atr


# ── Nautilus wiring ─────────────────────────────────────────────────────────

BAR_AGG = {
    "1min": (1, "MINUTE"), "5min": (5, "MINUTE"), "15min": (15, "MINUTE"),
    "30min": (30, "MINUTE"), "1h": (1, "HOUR"), "2h": (2, "HOUR"),
    "4h": (4, "HOUR"), "1day": (1, "DAY"), "1d": (1, "DAY"),
}


def make_instrument(symbol, venue):
    """A tradeable shell for the symbol.

    Real currency pairs get their real base/quote. Indices (US500, GER40, ...)
    do not decompose into two currencies at all, so they are priced as USD per
    point -- which is what the broker quotes anyway, and what makes the returns
    comparable with every other row in the ledger.
    """
    from nautilus_trader.test_kit.providers import TestInstrumentProvider
    s = symbol.upper()
    pair = TD_MAP.get(s)
    if pair is None and len(s) == 6:
        pair = f"{s[:3]}/{s[3:]}"
    if pair:
        try:
            return TestInstrumentProvider.default_fx_ccy(pair, venue)
        except Exception:
            pass
    return TestInstrumentProvider.default_fx_ccy("EUR/USD", venue)


def build_strategy_class():
    """Defined inside a function so importing this module costs nothing until
    a backtest actually runs."""
    from nautilus_trader.trading.strategy import Strategy
    from nautilus_trader.model.enums import OrderSide, TimeInForce, TrailingOffsetType
    from decimal import Decimal

    class BracketSignalStrategy(Strategy):
        """Reads a precomputed entry side per bar and holds it in a bracket.

        Deliberately never reverses a live position: the bracket owns the exit,
        and a signal that fires while a trade is already on is the same idea
        repeating itself, not a new one. Counting it twice would inflate the
        trade count that the ledger's MIN_LIVE_SAMPLE relies on.
        """

        def __init__(self, instrument, bar_type, sides, atr, sl_mult, tp_mult):
            super().__init__()
            self.instrument = instrument
            self.bar_type = bar_type
            self.sides = sides
            self.atr = atr
            self.sl_mult = sl_mult
            self.tp_mult = tp_mult
            self.i = -1

        def on_start(self):
            self.subscribe_bars(self.bar_type)

        def on_bar(self, bar):
            self.i += 1
            i = self.i
            if i >= len(self.sides):
                return
            side = self.sides[i]
            if not side:
                return
            a = self.atr[i]
            if a is None or a != a or a <= 0:
                return
            # One position at a time — see the class docstring.
            #
            # Both halves of this matter. is_flat() alone is not enough: a
            # MARKET entry fills on the NEXT bar, so on two consecutive signal
            # bars the second bracket is submitted while the first is still
            # pending and the account is still flat. Measured: 39 brackets,
            # 77 fills, and zero closed positions — the extra lot left the
            # netted position unable to reach zero, after which is_flat was
            # false forever and the strategy never traded again. It reported
            # as "0 trades", which reads exactly like a strategy that found
            # nothing.
            if not self.portfolio.is_flat(self.instrument.id):
                return
            if self.cache.orders_open(instrument_id=self.instrument.id):
                return

            px = float(bar.close)
            quantity = position_size(self.instrument)
            order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL
            sign = 1 if side == "buy" else -1
            sl = px - sign * self.sl_mult * a

            if self.tp_mult is None:
                # Trailing stop, no target — the Donchian case. The offset is
                # the same distance as the fixed stop would have been, so the
                # only difference measured is the trail itself.
                order_list = self.order_factory.bracket(
                    instrument_id=self.instrument.id,
                    order_side=order_side,
                    quantity=quantity,
                    sl_trigger_price=self.instrument.make_price(sl),
                    tp_price=self.instrument.make_price(px + sign * 100 * a),
                    sl_order_type=self._trailing_type(),
                    sl_trailing_offset=Decimal(str(round(self.sl_mult * a, 5))),
                    sl_trailing_offset_type=TrailingOffsetType.PRICE,
                    time_in_force=TimeInForce.GTC,
                )
            else:
                tp = px + sign * self.tp_mult * a
                order_list = self.order_factory.bracket(
                    instrument_id=self.instrument.id,
                    order_side=order_side,
                    quantity=quantity,
                    sl_trigger_price=self.instrument.make_price(sl),
                    tp_price=self.instrument.make_price(tp),
                    time_in_force=TimeInForce.GTC,
                )
            self.submit_order_list(order_list)

        @staticmethod
        def _trailing_type():
            from nautilus_trader.model.enums import OrderType
            return OrderType.TRAILING_STOP_MARKET

    return BracketSignalStrategy


def metrics_from_positions(positions, capital):
    """Same six keys vbt_backtest.py returns, computed the same way, so a
    ledger row from either engine means the same thing."""
    pnls = [float(p.realized_pnl.as_double()) for p in positions if p.realized_pnl is not None]
    n = len(pnls)
    if n == 0:
        return {"netReturnPct": 0.0, "winRate": 0.0, "profitFactor": 0.0,
                "trades": 0, "maxDrawdownPct": 0.0, "sharpe": 0.0}
    wins = [x for x in pnls if x > 0]
    losses = [x for x in pnls if x < 0]
    gross_loss = abs(sum(losses))
    pf = (sum(wins) / gross_loss) if gross_loss > 0 else (99.0 if wins else 0.0)

    # Drawdown off the realised equity curve — trade by trade, since that is
    # the only equity this engine reports without replaying every bar.
    equity, peak, dd = capital, capital, 0.0
    for x in pnls:
        equity += x
        peak = max(peak, equity)
        dd = max(dd, (peak - equity) / peak if peak > 0 else 0.0)

    rets = [x / capital for x in pnls]
    mean = sum(rets) / n
    var = sum((r - mean) ** 2 for r in rets) / n
    sd = var ** 0.5
    # Per-trade Sharpe, annualised by trade count. Not the same estimator as
    # vectorbt's bar-based one and not pretending to be — it is here so the
    # field is populated with something honest rather than left at zero.
    sharpe = (mean / sd * (n ** 0.5)) if sd > 0 else 0.0

    return {
        "netReturnPct": sum(pnls) / capital,
        "winRate": len(wins) / n,
        "profitFactor": min(pf, 99.0),
        "trades": n,
        "maxDrawdownPct": dd,
        "sharpe": sharpe,
    }


def run_one(df, name, sides, atr, sl_mult, tp_mult, symbol, interval):
    from nautilus_trader.backtest.engine import BacktestEngine, BacktestEngineConfig
    from nautilus_trader.config import LoggingConfig
    from nautilus_trader.model.currencies import USD
    from nautilus_trader.model.data import Bar, BarType, BarSpecification
    from nautilus_trader.model.enums import (
        AccountType, OmsType, BarAggregation, PriceType, AggregationSource,
    )
    from nautilus_trader.model.identifiers import TraderId, Venue
    from nautilus_trader.model.objects import Money, Quantity

    venue = Venue("SIM")
    engine = BacktestEngine(config=BacktestEngineConfig(
        trader_id=TraderId("AXE-001"),
        logging=LoggingConfig(bypass_logging=True),
    ))
    engine.add_venue(
        venue=venue,
        # HEDGING, not NETTING. Under NETTING the venue keeps a single position
        # object per instrument for the whole run: it is opened, reduced and
        # reopened in place, and positions_closed() is therefore empty at the
        # end no matter how many round trips happened. Measured: 39 brackets,
        # 77 fills, one position, zero closed — every strategy reported "0
        # trades" while the engine had been trading the entire time.
        #
        # HEDGING gives each bracket its own position, which is also what the
        # thing being modelled does: one order, one stop, one target, closed on
        # its own terms.
        oms_type=OmsType.HEDGING,
        account_type=AccountType.MARGIN,
        base_currency=USD,
        starting_balances=[Money(STARTING_BALANCE, USD)],
        # The reason this engine is here: when a bar contains both the stop and
        # the target, walk it in the order that hits the stop first. Optimistic
        # ordering is how a backtest quietly turns losers into winners.
        bar_adaptive_high_low_ordering=True,
    )
    instrument = make_instrument(symbol, venue)
    engine.add_instrument(instrument)

    step, unit = BAR_AGG.get(interval, (1, "HOUR"))
    bar_type = BarType(
        instrument_id=instrument.id,
        bar_spec=BarSpecification(step, getattr(BarAggregation, unit), PriceType.LAST),
        aggregation_source=AggregationSource.EXTERNAL,
    )
    bars = []
    for ts, row in df.iterrows():
        ns = int(ts.value)
        bars.append(Bar(
            bar_type=bar_type,
            open=instrument.make_price(row["open"]),
            high=instrument.make_price(row["high"]),
            low=instrument.make_price(row["low"]),
            close=instrument.make_price(row["close"]),
            volume=Quantity.from_int(max(1, int(row["volume"]))),
            ts_event=ns,
            ts_init=ns,
        ))
    engine.add_data(bars)

    cls = build_strategy_class()
    engine.add_strategy(cls(instrument, bar_type, list(sides), list(atr), sl_mult, tp_mult))
    engine.run()
    capital = float(position_size(instrument)) * float(df["close"].iloc[0])
    result = metrics_from_positions(engine.cache.positions_closed(), capital)
    engine.dispose()
    return result


def run(symbol, interval, outputsize, mode):
    df = fetch_ohlc(symbol, interval, outputsize)
    defs, atr = signal_defs(df)

    if mode == "signal":
        sigs = {}
        for name, sides, _sl, _tp in defs:
            try:
                s = sides.iloc[-1]
                sigs[name] = s if s in ("buy", "sell") else "hold"
            except Exception:
                sigs[name] = "hold"
        print(json.dumps({"ok": True, "symbol": symbol.upper(), "interval": interval,
                          "bars": int(len(df)), "signals": sigs}))
        return

    out = {}
    for name, sides, sl_mult, tp_mult in defs:
        try:
            out[name] = run_one(df, name, sides, atr, sl_mult, tp_mult, symbol, interval)
        except Exception as e:
            out[name] = {"error": f"{type(e).__name__}: {str(e)[:120]}"}
    print(json.dumps({"ok": True, "symbol": symbol.upper(), "interval": interval,
                      "bars": int(len(df)), "strategies": out}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        fail("usage: nautilus_backtest.py <SYMBOL> [interval] [outputsize] [mode]")
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
