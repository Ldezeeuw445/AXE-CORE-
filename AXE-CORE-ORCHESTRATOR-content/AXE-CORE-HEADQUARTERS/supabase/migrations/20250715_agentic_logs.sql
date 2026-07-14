-- AXE CORE Agentic Logs Table
-- Stores every step of every agentic run for real-time monitoring and debugging.

create table if not exists agentic_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id text,
  user_id text,
  agent text not null,
  model text,
  provider text,
  step_number int,
  role text check (role in ('user','assistant','tool','system')),
  content text,
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  status text check (status in ('pending','running','success','error')),
  latency_ms int,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Indexes for fast lookups
comment on table agentic_logs is 'Logs every step of agentic engine runs';
comment on column agentic_logs.conversation_id is 'Groups steps belonging to one agent run';
comment on column agentic_logs.step_number is 'Sequential step number within a run';
comment on column agentic_logs.role is 'user | assistant | tool | system';
comment on column agentic_logs.status is 'pending | running | success | error';

create index idx_agentic_logs_conv on agentic_logs(conversation_id);
create index idx_agentic_logs_created on agentic_logs(created_at desc);
create index idx_agentic_logs_agent on agentic_logs(agent);
create index idx_agentic_logs_status on agentic_logs(status);
