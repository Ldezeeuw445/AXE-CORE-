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
| NautilusTrader | `nt:` | `/opt/axe-nautilus/venv` | **3.12+** | `nautilus_backtest.py` |

## vectorbt

```bash
mkdir -p /opt/axe-trading && cd /opt/axe-trading
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install vectorbt httpx
# copy vbt_backtest.py here
```

## NautilusTrader

**Pinned to 1.231.0, which needs Python 3.12–3.14.** Nautilus publishes no
wheel outside that range and building from source needs a Rust toolchain, so
the interpreter decides the version rather than the other way round:

| release line | supports |
|---|---|
| 1.221.0 | 3.11 – 3.13 |
| 1.222.0 – 1.231.0 | 3.12 – 3.14 |

api.axecompanion.com runs Ubuntu 24.04 / Python 3.12.3, so 1.231.0 fits with
no new interpreter. Verified the engine gives byte-identical results on
1.221.0/3.11 and 1.231.0/3.12 before pinning — same trade counts, same returns
to fifteen decimals — so the pin is a deployment choice, not a behavioural one.

```bash
mkdir -p /opt/axe-nautilus && cd /opt/axe-nautilus
python3 -m venv venv          # apt install python3.12-venv first if this fails
./venv/bin/pip install --upgrade pip
./venv/bin/pip install "nautilus_trader==1.231.0" httpx pandas
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

## TradingAgents — what has actually been tried (2026-08-20)

Every configuration below was run to completion against the real engine. None
of them works, and they fail for different reasons, so the table is here to
stop the next session spending an afternoon rediscovering it.

| Config | Result |
|---|---|
| Ollama `llama3.2:3b` | Finished in 33 min. Decision was EMPTY — the risk judge's JSON would not parse, library fell back to text-only: no rationale, no stop, no target. |
| Ollama `hermes3:8b` | Died after 629s — `RemoteProtocolError: Server disconnected`. Ollama dropped the connection. |
| Groq `openai/gpt-oss-20b/120b` | Died after 8s — rate limited. The free tier gives **8,000 tokens/minute**; a debate spends that in one or two calls. Retries cannot help: they re-send the same prompt. |
| Groq `groq/compound` | Died after 6s — **`tool calling` is not supported with this model**, and the analysts fetch their data through tools. It has 70,000 TPM, which is the budget needed, and cannot use it. |

So the requirement is specific: a **tool-calling** model with a **large token
budget**. On this account that means Groq's paid tier, or a provider with
credits (OpenAI/Anthropic/OpenRouter). It is not a code problem and not a
prompt problem, and no amount of local hardware fixes it — a debate is simply
an expensive thing to run.

Two more findings worth keeping:

* TradingAgents is built for **equities**. FX, metals, indices and crypto have
  no earnings, no fundamentals and no insider data, so on this desk's universe
  its fundamentals analyst is structurally blind. Every decision carries a
  `coverage` field saying so.
* Its symbol resolution is equity-shaped too: it resolved `GC=F` (gold) to
  `0P00019HF1.SA`, a Brazilian fund, and asked for its earnings.
