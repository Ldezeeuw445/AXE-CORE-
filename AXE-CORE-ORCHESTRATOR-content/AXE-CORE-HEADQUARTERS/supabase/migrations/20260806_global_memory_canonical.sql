-- Documents the table that is ACTUALLY live and in use for memoryRecorder /
-- globalMemoryService / reflectionService / tradingAgentMemoryService writes:
-- public.global_memory (singular). It already exists in production with
-- real rows — this migration is `create table if not exists`, so it is a
-- no-op there and only matters for a fresh environment.
--
-- Why singular, not the `global_memories` (plural) table from
-- 20260715_global_memory.sql: that migration's schema uses a `uuid` user_id
-- with a hard FK to auth.users(id), but every write in the app uses
-- AXE_USER_ID (chatPersistence.ts), a synthetic string like
-- "acff7a12-1111-481d-a7a9-cc07583b8069-axe-core" — not a valid uuid once the
-- app-source suffix is appended, and not a row in auth.users either. That
-- table was live-verified to hold 0 rows; `global_memory` (this one) holds
-- real reflections, preferences and (as of this migration) chat/agent/crew
-- events. `global_memories` is left in place, superseded, not dropped.
--
-- user_id is `text` on purpose (see above), and (user_id, key) is unique so
-- memUpsert's on_conflict="user_id,key" upsert semantics have something to
-- target — append-only events use a unique timestamped key, preferences /
-- performance counters intentionally reuse one key to overwrite.

create table if not exists public.global_memory (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  category text not null,
  key text not null,
  value text not null,
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists idx_global_memory_user_id on public.global_memory (user_id);
create index if not exists idx_global_memory_category on public.global_memory (category);
create index if not exists idx_global_memory_updated on public.global_memory (updated_at desc);

alter table public.global_memory enable row level security;

-- Same pattern as core_obsidian_notes / core_trust_levels: all real access
-- goes through axe_api's service_role client, not the browser's anon key.
drop policy if exists svc_global_memory on public.global_memory;
create policy svc_global_memory on public.global_memory
  for all using (true) with check (true);

create or replace function public.update_global_memory_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_global_memory_updated_at on public.global_memory;
create trigger trigger_global_memory_updated_at
  before update on public.global_memory
  for each row
  execute function public.update_global_memory_updated_at();

comment on table public.global_memory is
  'Canonical global memory table. Written via axe_api /memory/upsert (service_role) — see memoryRecorder.ts / globalMemoryService.saveGlobalMemory. Supersedes the unused global_memories (plural) table from 20260715_global_memory.sql.';
