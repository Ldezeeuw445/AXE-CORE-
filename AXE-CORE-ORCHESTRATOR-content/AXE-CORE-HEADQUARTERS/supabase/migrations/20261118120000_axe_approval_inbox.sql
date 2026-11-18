-- AXE-inbox: één record per goedkeuring, beleid per manager/categorie, audit.
--
-- NIET toepassen op productie in deze PR. De app valt tot die tijd terug op
-- localStorage (beleidOpslag.ts). deal_automation_policy.auto_send_* blijft
-- ongemoeid. Auto-approve hier is nooit human_approved.
--
-- Fase 2 (haakjes, niet gebouwd): thread_id + message_id koppelen hetzelfde
-- record aan een manager-bericht. Een emoji-reactie of in-thread Approve
-- schrijft axe_approval_decisions.via = 'reaction' of 'thread' op DÉZE rij,
-- niet op een tweede.

create table if not exists public.axe_approval_items (
  item_id text primary key,
  source text not null check (source in ('axe', 'northsea')),
  source_id text not null,
  manager_id text not null,
  category text not null,
  title text not null,
  doet text,
  waarom text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'auto_approved', 'auto_rejected')),
  -- Fase 2: dezelfde sleutel als het manager-bericht / de inline kaart.
  thread_id text,
  message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists axe_approval_items_source
  on public.axe_approval_items (source, source_id);
create unique index if not exists axe_approval_items_draad
  on public.axe_approval_items (thread_id, message_id)
  where thread_id is not null and message_id is not null;
create index if not exists axe_approval_items_pending
  on public.axe_approval_items (status, manager_id, category)
  where status = 'pending';

create table if not exists public.axe_approval_policies (
  manager_id text not null,
  category text not null,
  mode text not null check (mode in ('escalate', 'auto_approve', 'auto_reject')),
  axe_may_approve_all boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (manager_id, category)
);

create table if not exists public.axe_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.axe_approval_items(item_id) on delete cascade,
  action text not null check (action in ('approve', 'reject', 'auto_approve', 'auto_reject')),
  actor_type text not null check (actor_type in ('human', 'axe_policy', 'manager')),
  reason text not null,
  via text not null check (via in ('inbox', 'bulk', 'reaction', 'thread', 'policy')),
  thread_id text,
  message_id text,
  at timestamptz not null default now()
);

create index if not exists axe_approval_decisions_item
  on public.axe_approval_decisions (item_id, at desc);

-- Conservatieve NorthSea-defaults. Prijs/contract/commitment/identiteit/
-- deal-move/risk/inbound-offer/policy/bounce blijven escalate tot Luka
-- zelf axe_may_approve_all aanzet.
insert into public.axe_approval_policies (manager_id, category, mode, axe_may_approve_all)
values
  ('northseamgr', 'chase', 'auto_approve', false),
  ('northseamgr', 'cold_outreach', 'auto_approve', false),
  ('northseamgr', 'nonbinding', 'auto_approve', false),
  ('northseamgr', 'internal', 'auto_approve', false),
  ('northseamgr', 'generic_qualification', 'auto_reject', false),
  ('northseamgr', 'price', 'escalate', false),
  ('northseamgr', 'contract', 'escalate', false),
  ('northseamgr', 'commitment', 'escalate', false),
  ('northseamgr', 'identity_disclosure', 'escalate', false),
  ('northseamgr', 'deal_move', 'escalate', false),
  ('northseamgr', 'risk_counterparty', 'escalate', false),
  ('northseamgr', 'inbound_offer', 'escalate', false),
  ('northseamgr', 'policy_change', 'escalate', false),
  ('northseamgr', 'bounce', 'escalate', false),
  ('northseamgr', 'unsure', 'escalate', false)
on conflict (manager_id, category) do nothing;

alter table public.axe_approval_items enable row level security;
alter table public.axe_approval_policies enable row level security;
alter table public.axe_approval_decisions enable row level security;

-- Server-only, zelfde reden als core_approvals: de VPS (service_role) leest
-- en schrijft. Geen anon, geen authenticated.
create policy service_role_only on public.axe_approval_items
  for all to service_role using (true) with check (true);
create policy service_role_only on public.axe_approval_policies
  for all to service_role using (true) with check (true);
create policy service_role_only on public.axe_approval_decisions
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on table public.axe_approval_items to service_role;
grant select, insert, update, delete on table public.axe_approval_policies to service_role;
grant select, insert, update, delete on table public.axe_approval_decisions to service_role;
