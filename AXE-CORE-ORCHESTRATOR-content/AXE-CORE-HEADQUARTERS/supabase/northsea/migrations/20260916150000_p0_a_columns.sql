-- NorthSea P0-A (AXE Commodities, kbimnuepbecbyezedvih): alleen toevoegen, geen gedrag.
--
-- Volgorde P0: A (kolommen) -> nieuwe edge functions -> B (guards/triggers) -> C (data).
-- A breekt de oude functions niet: alles is nullable of heeft een default.
-- Historische onbekenden blijven NULL (onbekend); niets wordt achteraf ingevuld
-- alsof het bekend was.

-- ── P0.5 Contactbeleid (machine-leesbaar do-not-contact) ────────────────────
alter table public.companies
  add column if not exists contact_policy text not null default 'allowed',
  add column if not exists contact_policy_reason text,
  add column if not exists contact_policy_set_at timestamptz,
  add column if not exists contact_policy_set_by text;
alter table public.contacts
  add column if not exists contact_policy text not null default 'allowed',
  add column if not exists contact_policy_reason text,
  add column if not exists contact_policy_set_at timestamptz,
  add column if not exists contact_policy_set_by text;
do $$ begin
  alter table public.companies add constraint companies_contact_policy_check
    check (contact_policy in ('allowed','review_required','do_not_contact'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.contacts add constraint contacts_contact_policy_check
    check (contact_policy in ('allowed','review_required','do_not_contact'));
exception when duplicate_object then null; end $$;

-- ── P0.6 Synthetische/testdata ───────────────────────────────────────────────
alter table public.companies          add column if not exists is_synthetic boolean not null default false, add column if not exists synthetic_reason text;
alter table public.buyer_requirements add column if not exists is_synthetic boolean not null default false, add column if not exists synthetic_reason text;
alter table public.supplier_offers    add column if not exists is_synthetic boolean not null default false, add column if not exists synthetic_reason text;
alter table public.opportunities      add column if not exists is_synthetic boolean not null default false, add column if not exists synthetic_reason text;
alter table public.sourcing_campaigns add column if not exists is_synthetic boolean not null default false, add column if not exists synthetic_reason text;
alter table public.communications     add column if not exists is_synthetic boolean not null default false, add column if not exists synthetic_reason text;
alter table public.call_intelligence  add column if not exists is_synthetic boolean not null default false, add column if not exists synthetic_reason text;

-- ── P0.4 Goedkeuringsintegriteit op reply_drafts ─────────────────────────────
-- approval_status blijft de menselijke beslissing (pending/approved/rejected/sent),
-- plus not_required: een door beleid toegestane automatische verzending. Die is
-- nadrukkelijk GEEN goedkeuring.
alter table public.reply_drafts
  add column if not exists lifecycle_state text,
  add column if not exists approval_actor_type text,
  add column if not exists approved_by text,
  add column if not exists approval_channel text,
  add column if not exists policy_decision jsonb;
alter table public.reply_drafts drop constraint if exists reply_drafts_approval_status_check;
alter table public.reply_drafts add constraint reply_drafts_approval_status_check
  check (approval_status in ('pending','approved','rejected','sent','not_required'));
do $$ begin
  alter table public.reply_drafts add constraint reply_drafts_lifecycle_state_check
    check (lifecycle_state is null or lifecycle_state in ('generated','drafted','policy_allowed','approval_required','human_approved',
                                                          'rejected','blocked','sent','delivered','failed','bounced'));
  alter table public.reply_drafts add constraint reply_drafts_approval_actor_type_check
    check (approval_actor_type is null or approval_actor_type in ('human','unknown'));
  alter table public.reply_drafts add constraint reply_drafts_approval_channel_check
    check (approval_channel is null or approval_channel in ('deal_desk','northsea_mcp'));
exception when duplicate_object then null; end $$;

-- Historische drafts: afgeleide levenscyclus. Wie een historische draft goedkeurde
-- is niet vastgelegd, dus 'unknown' -- nooit 'human'.
update public.reply_drafts set lifecycle_state = case
    when sent_at is not null or resend_email_id is not null then 'sent'
    when approval_status = 'rejected' then 'rejected'
    when approval_status = 'pending' then 'approval_required'
    else 'drafted' end
  where lifecycle_state is null;
update public.reply_drafts set approval_actor_type = 'unknown'
  where approval_status in ('approved','sent') and approval_actor_type is null;

-- ── P0.7 + P0.8 Koppeling en verzend-herkomst op communications ─────────────
alter table public.communications
  add column if not exists rfc_message_id text,
  add column if not exists mapping_status text,
  add column if not exists mapping_basis text,
  add column if not exists mapping_candidates jsonb,
  add column if not exists from_address text,
  add column if not exists reply_to_address text,
  add column if not exists transport text,
  add column if not exists actor_type text,
  add column if not exists actor text,
  add column if not exists approval_basis text,
  add column if not exists reply_draft_id uuid references public.reply_drafts(id) on delete set null;
do $$ begin
  alter table public.communications add constraint communications_mapping_status_check
    check (mapping_status is null or mapping_status in ('mapped','ambiguous','unmapped','manual_review','synthetic'));
  alter table public.communications add constraint communications_actor_type_check
    check (actor_type is null or actor_type in ('human','service','automation'));
  alter table public.communications add constraint communications_approval_basis_check
    check (approval_basis is null or approval_basis in ('human_approved_draft','policy_allowed','system_acknowledgement'));
exception when duplicate_object then null; end $$;
create index if not exists communications_rfc_message_id_idx on public.communications (rfc_message_id) where rfc_message_id is not null;

-- ── P0.4/P0.9 Canonieke audit voor edge functions ────────────────────────────
-- deal_events vraagt een opportunity_id; beslissingen zonder deal (DNC, mapping,
-- webhook, desk-acties) horen hier. Alleen service role (RLS aan, geen policies).
create table if not exists public.northsea_audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('human','service','automation','system')),
  actor text not null,
  action text not null,
  policy_decision jsonb,
  approval_identity text,
  communication_id uuid,
  opportunity_id uuid,
  company_id uuid,
  contact_id uuid,
  draft_id uuid,
  details jsonb not null default '{}'::jsonb
);
alter table public.northsea_audit_events enable row level security;
create index if not exists northsea_audit_events_occurred_idx on public.northsea_audit_events (occurred_at desc);
revoke all on public.northsea_audit_events from anon, authenticated;
