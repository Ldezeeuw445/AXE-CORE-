-- AXE CORE Shared Memory Table
-- Key-value store for agents to share context and intermediate results across runs.

create table if not exists shared_memory (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  agent_id text,
  ttl_seconds int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table shared_memory is 'Shared memory for agentic engine — key-value store with TTL';
comment on column shared_memory.key is 'Unique key for the memory entry';
comment on column shared_memory.ttl_seconds is 'Time-to-live in seconds; null = no expiration';

create index idx_shared_memory_key on shared_memory(key);
create index idx_shared_memory_agent on shared_memory(agent_id);
create index idx_shared_memory_updated on shared_memory(updated_at desc);
