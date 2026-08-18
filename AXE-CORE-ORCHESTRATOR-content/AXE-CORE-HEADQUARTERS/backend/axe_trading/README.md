# axe-trading — vectorbt self-test / signal engine

Isolated Python venv on the VPS (`/opt/axe-trading/venv`) so vectorbt's heavy
pinned deps (numba/numpy) never touch the running `axe-core-api`.

## Deploy (on the VPS)
```bash
mkdir -p /opt/axe-trading && cd /opt/axe-trading
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install vectorbt httpx
# copy vbt_backtest.py here
```
`axe-core-api` shells out to it from `/backtest/vectorbt` and `/signal/vectorbt`,
passing `TWELVEDATA_API_KEY` from its own env.

## Usage
```
vbt_backtest.py <SYMBOL> [interval=1h] [outputsize=1000] [mode=backtest|signal]
```
Strategies (`vbt:*`) compete as candidates in AXE Algo's per-pair×strategy
ledger — the framework-agnostic brain ranks them against AXE's own strategies.
