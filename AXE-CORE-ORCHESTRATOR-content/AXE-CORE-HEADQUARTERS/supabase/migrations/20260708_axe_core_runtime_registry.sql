-- AXE CORE runtime registry
-- Adds durable logs, memory storage, and execution modes for capability routing.

create table if not exists public.core_system_logs (
  id          uuid primary key default gen_random_uuid(),
  level       text not null check (level in ('debug', 'info', 'warn', 'error')),
  source      text not null,
  message     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_core_system_logs_created_at on public.core_system_logs (created_at desc);
create index if not exists idx_core_system_logs_source on public.core_system_logs (source);

create table if not exists public.core_memory (
  id           uuid primary key default gen_random_uuid(),
  content      text not null,
  tags         text[] not null default '{}',
  importance   integer not null default 5,
  source       text not null default 'manual',
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_core_memory_created_at on public.core_memory (created_at desc);
create index if not exists idx_core_memory_source on public.core_memory (source);

alter table public.core_capabilities
  add column if not exists execution_mode text not null default 'read';

alter table public.core_capabilities
  add constraint core_capabilities_execution_mode_check
  check (execution_mode in ('read', 'patch', 'execute'));

update public.core_capabilities
set execution_mode = case capability
  when 'code' then 'patch'
  when 'trading' then 'execute'
  else 'read'
end
where execution_mode is null or execution_mode = 'read';

alter table public.core_system_logs enable row level security;
alter table public.core_memory enable row level security;

do $$ begin
  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_system_logs'
      and policyname = 'svc_core_system_logs'
  ) then
    create policy svc_core_system_logs on public.core_system_logs using (true);
  end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_memory'
      and policyname = 'svc_core_memory'
  ) then
    create policy svc_core_memory on public.core_memory using (true);
  end if;
end $$;
