-- Obsidian bridge: durable, cross-session notes that every AXE session can
-- read/write via Supabase. Optional Mac-side sync later materializes these
-- as real .md files in Luka's Obsidian vault (one-way Core → vault first).
-- Applied design matches NEXT_LEVEL_PLAN.md §4 (2026-07-27).

create table if not exists public.core_obsidian_notes (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  title text not null,
  content text not null default '',
  tags text[] not null default '{}',
  wikilinks text[] not null default '{}',
  source text not null default 'axe' check (source in ('axe','user','reflection','system','sync')),
  user_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (path)
);

create index if not exists idx_core_obsidian_notes_updated
  on public.core_obsidian_notes (updated_at desc);
create index if not exists idx_core_obsidian_notes_tags
  on public.core_obsidian_notes using gin (tags);
create index if not exists idx_core_obsidian_notes_title
  on public.core_obsidian_notes (title);

alter table public.core_obsidian_notes enable row level security;

-- Service-role / axe_api path uses bypass; keep a permissive policy for
-- the same pattern used by core_trust_levels and core_notifications.
drop policy if exists svc_core_obsidian_notes on public.core_obsidian_notes;
create policy svc_core_obsidian_notes on public.core_obsidian_notes
  for all using (true) with check (true);

create or replace function public.update_core_obsidian_notes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_core_obsidian_notes_updated_at on public.core_obsidian_notes;
create trigger trigger_core_obsidian_notes_updated_at
  before update on public.core_obsidian_notes
  for each row
  execute function public.update_core_obsidian_notes_updated_at();

comment on table public.core_obsidian_notes is
  'AXE CORE Obsidian bridge — session-agnostic durable notes; optional Mac vault sync reads this table.';
