-- Capability/trust ladder: per approval-gated category (exec, git_write,
-- git_pr_merge, db_sql, vercel_promote, agent), a real track record
-- (approved/denied/auto-run counts) plus a manual auto_approve switch.
-- auto_approve defaults to false for every category (matches today's
-- "always ask" behavior) and is ONLY ever flipped by Luka in Settings —
-- never raised by AXE itself. Applied live via Supabase MCP on
-- 2026-07-27; this file documents that change for local dev / history.

create table if not exists public.core_trust_levels (
  id uuid primary key default gen_random_uuid(),
  category text unique not null check (category in ('exec','git_write','git_pr_merge','db_sql','vercel_promote','agent')),
  auto_approve boolean not null default false,
  approved_count integer not null default 0,
  denied_count integer not null default 0,
  auto_run_count integer not null default 0,
  last_decision_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.core_trust_levels enable row level security;

create policy svc_core_trust_levels on public.core_trust_levels
  for all using (true) with check (true);

insert into public.core_trust_levels (category, auto_approve)
values
  ('exec', false),
  ('git_write', false),
  ('git_pr_merge', false),
  ('db_sql', false),
  ('vercel_promote', false),
  ('agent', false)
on conflict (category) do nothing;
