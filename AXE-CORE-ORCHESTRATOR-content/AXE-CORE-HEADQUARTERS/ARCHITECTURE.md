# AXE — the shape it should have

**Nothing here is built yet.** This is the structure to agree on *before* the
next thing gets added, because the complaint that produced it is fair: the
answer to every request so far has been more building, and the pile is now the
problem.

Every number below was measured on 2026-08-23, not remembered.

---

## What is actually there

### Two agent registries, holding the same agents twice

```
core_agents (6)   axe_companion · axe_intel · axe_trader
                  axe_developer · axe_ollama · axe_core

agents (14)       Memory · Code · Browser · ThinkTank · CrewAI Manager
                  EVE · Infrastructure · App/Agent Manager · Task
                  Finance · AXE Companion · AXE Intel · …
```

`axe_companion` and `AXE Companion` are one agent in two tables under two
naming conventions. Same for `axe_intel`. That is the duplication visible in
the Agent Center.

### Memory spread over six live tables

| Table | Rows |
|---|---|
| `global_memory` | 1000+ |
| `rag_memories` | 1000+ |
| `assistant_memory_entries` | 884 |
| `core_memory` | 345 |
| `agent_memory` | 24 |
| `axe_memory` | 24 |

Plus three empty ones: `assistant_memory`, `shared_memory`, and
`global_memories` — which differs from the live `global_memory` by a single
letter. Two near-identical names where one is empty is how months of writes go
to the wrong place unnoticed.

**This is why the trader repeats itself.** `agent_memory` holds 24 rows for
something that has been running for months, while 3000+ rows sit elsewhere.
Every lesson in the Brain tab reads `Loss on BTCUSD — trailing 19-trade win
rate 58%` because it is learning from a bucket, not from the record.

### 132 tables in one shared database

Trades alone live in `broker_trades`, `mt5_positions`,
`mt5_closed_positions`, `positions`, `trade_journal_labels` and
`user_journal_entries`.

---

## The mistake underneath all of it

Half the entries in the `agents` table are not agents. Memory, Browser, Code,
Task, Infrastructure — those are **tools every agent uses**. Calling them
agents is what prevents a hierarchy from forming: everything sits on one
plane, so nothing is owned by anything, so two things can both half-own trades
and neither is wrong.

---

## The shape to build toward

### One orchestrator

**AXE CORE** routes and owns no domain of its own. It decides who handles a
request; it does not handle it.

### Four domain owners

Each owns its data and its decisions **exclusively**. If two things both write
trades, one of them is wrong.

| Owner | Owns |
|---|---|
| **Trading** | positions, orders, the funnel, strategy performance |
| **Intel** | research, market context, the feeds |
| **Development** | the repos, builds, deploys |
| **Companion** | the user-facing product surface |

### Everything else is a capability, not an agent

Memory, Browser, Code, Task, Infrastructure, Finance. They live in their own
list. Agents *use* them. They decide nothing, and they never appear in an
agent registry.

---

## The rule that stops it growing back

**One thing, one place, one name.**

Two tables that mean the same thing is a bug, not a migration path. That
applies to `agents` / `core_agents` exactly as it applies to the six memory
tables. Anything that "we'll consolidate later" is the thing that produced
this document.

---

## Order of work, once this is agreed

1. **Memory to one source of truth.** Until this is done the trader cannot
   learn, and every feature added on top learns from the same 24 rows.
2. **One agent registry**, with the capabilities moved out of it.
3. **Trades to one table**, the other five made views or deleted.
4. Only then: the pair registry, the trading manager, more accounts.

Doing 4 before 1 is what the last several rounds did.
