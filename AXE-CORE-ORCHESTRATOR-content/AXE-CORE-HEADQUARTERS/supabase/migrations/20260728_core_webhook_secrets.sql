-- Service-role-only secrets table backing edge-function webhooks (e.g. the
-- ring-webhook function that receives smart-ring vitals pushed from an
-- iPhone Shortcuts automation). RLS is enabled with zero policies attached,
-- so the anon/authenticated PostgREST roles get nothing back from this
-- table — only the service_role key (used inside edge functions, never
-- shipped to any client) bypasses RLS and can read it.
--
-- Applied live via Supabase MCP on 2026-07-28. The actual secret value and
-- the target user_id row were seeded live in the same session and are
-- deliberately NOT included here in plaintext — this file documents the
-- schema for local dev / history only.

create table if not exists public.core_webhook_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

alter table public.core_webhook_secrets enable row level security;

-- Seed rows (run once, values redacted — see live migration history):
-- insert into public.core_webhook_secrets (name, value) values
--   ('ring_webhook_secret', '<random hex token>'),
--   ('ring_webhook_user_id', '<axe user uuid>')
-- on conflict (name) do update set value = excluded.value;
