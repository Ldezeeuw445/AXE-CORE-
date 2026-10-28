-- Peer-berichten tussen de zes Grok Bot-managers (27 okt 2026).
-- AXE CORE Manager mag iedereen aanschrijven; de rest rapporteert terug.
-- Server-only: de VPS (service_role) leest en schrijft. Geen anon, geen
-- authenticated — dezelfde reden als core_approvals.

create table if not exists public.core_manager_messages (
  id uuid primary key default gen_random_uuid(),
  from_agent text not null,
  to_agent text not null,
  kind text not null check (kind in ('directive', 'report', 'ask')),
  body text not null,
  in_reply_to uuid references public.core_manager_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists core_manager_messages_to_ongelezen
  on public.core_manager_messages (to_agent, created_at desc)
  where read_at is null;

alter table public.core_manager_messages enable row level security;

grant select, insert, update on table public.core_manager_messages to service_role;
