# AXE — the shape it should have

**Status: memory and the agent hierarchy are now built. The rest is not.**
Everything below was measured on 2026-08-23, not remembered. The "was" numbers
are what it looked like before; the "is" numbers are what the database returns
today.

The complaint that produced this file was fair: the answer to every request had
been more building, and the pile had become the problem. So this describes the
shape first, and is updated only when the shape is real.

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

## What is built

### One memory — DONE

`memory`, 9 025 rows. `agent` is the namespace: an agent id for private rows,
`'global'` for what everyone may read. An agent reads its own plus global and
writes only its own; the service offers no way to write another namespace,
because such a capability would eventually be used.

```
axe_trader could read:      24 rows
axe_trader can read:     8 967 rows
```

`'global'` is a literal, not NULL — NULL already means "unknown", and reusing
it for "shared" made the two indistinguishable and unqueryable through the
app's own table API.

Writes are dual for now: the old layers still feed the Memory tab through
`unifiedMemoryService`. They come out after the read side moves, so there is
never a moment where a memory exists in neither place.

### One agent registry, with tiers — DONE

| Tier | Who | Owns |
|---|---|---|
| orchestrator | `axe_core` | routing. No domain of its own |
| domain | `axe_trader` `axe_intel` `axe_developer` `axe_companion` | its data and decisions, exclusively |
| capability | 13, incl. memory, browser, code, task, infrastructure | nothing. Tools agents use |

The `agents` table is folded in. Nothing collapses to a duplicate name any
more — checked, not assumed.

**The root cause, found here and worth remembering:** `memory_namespace` held
TABLE NAMES, not namespaces. Every agent pointed at a different table, which
is the six-table split written into the registry itself. `axe_trader` pointed
at `positions` and `axe_companion` at `assistant_memory` — both of which hold
**zero rows**. Their memory was empty by configuration, not by accident.

Capabilities have no namespace at all: they act for whoever called them, and
giving them one would split a domain's memory across its own tools.

## Still to do, in this order

1. **Move the read side** to `memory`, then remove the dual writes and the six
   old tables.
2. **Trades to one table** — they still live in six.
3. **Per-agent loop and self-improvement.** After 1, not before: they write
   into this memory, so building them first means wiring them twice.
4. Only then: the pair registry, the trading manager, more accounts.

Doing 4 before 1 is what the rounds before this file did.
