# axe-trading — framework engines (self-test / signal)

Each framework runs in its **own** venv on the VPS so its pinned deps never
touch the running `axe-core-api`. They are independent of each other too: one
being absent or broken cannot take the other down, and the API reports each
one's presence separately (`GET /frameworks/status`).

A framework is not a second brain. It contributes candidates to the same
per-pair×strategy×timeframe ledger, named with its own prefix, and the ranking
cannot tell which engine produced a number.

| Framework | Prefix | venv | Python | Script |
|---|---|---|---|---|
| vectorbt | `vbt:` | `/opt/axe-trading/venv` | 3.9+ | `vbt_backtest.py` |
| NautilusTrader | `nt:` | `/opt/axe-nautilus/venv` | **3.11+** | `nautilus_backtest.py` |

## vectorbt

```bash
mkdir -p /opt/axe-trading && cd /opt/axe-trading
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install vectorbt httpx
# copy vbt_backtest.py here
```

## NautilusTrader

**Needs Python 3.11 or newer** — it publishes no wheel for anything older, and
1.221.0 is the last release that still supports 3.11. If the VPS's `python3` is
older (Ubuntu 22.04 ships 3.10), install a newer interpreter first rather than
trying to build Nautilus from source, which needs a Rust toolchain.

```bash
# only if python3 is < 3.11
add-apt-repository -y ppa:deadsnakes/ppa && apt update && apt install -y python3.11 python3.11-venv

mkdir -p /opt/axe-nautilus && cd /opt/axe-nautilus
python3.11 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install "nautilus_trader==1.221.0" httpx pandas
# copy nautilus_backtest.py here
```

Check it before pointing the app at it:

```bash
TWELVEDATA_API_KEY=... /opt/axe-nautilus/venv/bin/python /opt/axe-nautilus/nautilus_backtest.py XAUUSD 1h 800
```

A healthy run prints four `nt:*` strategies each with a non-zero `trades`
count. **All four reading `"trades": 0` means the engine is running and not
trading** — that exact output was produced twice during development, once by
orders being denied for being under the instrument's minimum size and once by
`positions_closed()` being empty under NETTING. It is not a market opinion.

## Usage (both engines, same contract)

```
<script>.py <SYMBOL> [interval=1h] [outputsize=1000] [mode=backtest|signal]
```

`backtest` returns per-strategy metrics for the ledger's priors; `signal`
returns each strategy's current buy/sell/hold so AXE Algo can trade the
strategy the ledger picked, not just rank it.

## Why two engines rather than more strategies in one

vectorbt fills at the close of the signal bar; there is no path inside a bar,
so a stop cannot be modelled at all. Nautilus has a matching engine, so a
bracket is a real stop and a real target filled against each bar's high and
low, with `bar_adaptive_high_low_ordering` walking the pessimistic order when
both sit inside one bar. The `nt:*` strategies are therefore defined by their
exits, which is the half vectorbt cannot measure — not ports of the `vbt:*`
ones.
