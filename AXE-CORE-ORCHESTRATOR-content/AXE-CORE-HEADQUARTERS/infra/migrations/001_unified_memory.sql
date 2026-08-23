-- One memory, with a namespace per agent.
--
-- Measured before writing this (2026-08-23): memory was spread over six live
-- tables holding 9 875 rows between them, plus three empty ones beside them —
-- one of which, `global_memories`, differs from the live `global_memory` by a
-- single letter.
--
-- The cost was not tidiness. `agent_memory` held 24 rows while `global_memory`
-- held 6 777, and the trading agent reads `agent_memory`. It was learning from
-- 0.4% of what the system knew, which is why every lesson in the Brain tab is
-- the same sentence about BTCUSD.
--
-- ## The shape
--
-- `agent` IS the namespace, and NULL means shared:
--
--   agent = 'axe_trader'   the trader's own memory
--   agent IS NULL          global memory, readable by everyone
--
-- An agent reads `agent = 'me' OR agent IS NULL` and writes only its own. That
-- is "every agent has its own memory" and "there is one global memory" in a
-- single table, rather than two systems that drift apart.
--
-- The six shapes are genuinely different — a key/value store, a content store,
-- a scoped store, a trading-specific one — so this is their union, not the
-- widest of them. `symbol` gets a real column because trading queries it often
-- enough that living in metadata would mean a JSON scan per decision.

create table if not exists memory (
  id uuid primary key default gen_random_uuid(),

  -- WHO. The namespace. NULL = global, readable by every agent.
  agent       text,
  user_id     text,

  -- WHAT.
  kind        text not null default 'fact',   -- fact | lesson | event | doc
  key         text,                            -- stable key, for upserts
  content     text not null,

  -- CONTEXT.
  category    text,
  tags        text[],
  symbol      text,

  -- WEIGHT. Kept separate: confidence is how sure, importance is how much it
  -- matters. Collapsing them loses the difference between "certain and
  -- trivial" and "unsure but decisive".
  importance  real,
  confidence  real,

  -- WHERE IT CAME FROM. Set during the migration so nothing becomes
  -- untraceable, and so a bad import can be undone by source alone.
  source      text,
  metadata    jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The read every agent makes: its own rows plus the shared ones, newest first.
create index if not exists memory_agent_created_idx on memory (agent, created_at desc);
-- The global read, which is the hot path when an agent starts cold.
create index if not exists memory_global_idx on memory (created_at desc) where agent is null;
-- Trading asks "what do I know about this symbol" constantly.
create index if not exists memory_symbol_idx on memory (symbol) where symbol is not null;
-- Upserts by key inside a namespace.
create unique index if not exists memory_agent_key_idx on memory (agent, key) where key is not null;

comment on table memory is
  'Single source of truth for memory. agent = namespace, NULL = global. Replaces agent_memory, axe_memory, core_memory, global_memory, rag_memories, assistant_memory_entries.';
