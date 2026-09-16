-- NorthSea P1-A: Communication Engine (AXE Commodities). Alleen toevoegen; P0 wordt uitgebreid, nooit verzwakt.
--
--  * contacts.email_status: een bounced adres is een feit met herkomst (communicatie-id), geen notitie.
--  * northsea_outbound_block_reason kent 'bounced_channel': drafts en verzending naar dat exacte adres
--    worden geweigerd door dezelfde P0-triggers. Taken om een ander kanaal te vinden blijven mogelijk.
--  * email_intelligence: de uitgebreide engine-classificatie naast de oude (die blijft).
--  * opportunities: huidige blokkade en beste volgende actie VAN DE ENGINE, met redenen (overschrijft
--    niets dat agents of Luka invulden).
--  * northsea_followups: duurzaam en idempotent plan per ankerbericht en poging.
--  * action_queue.dedupe_key: de Chase-lijst krijgt geen dubbele items.
--  * deal_evidence: door de tegenpartij GENOEMDE termen, idempotent per bericht (klasse counterparty_stated).

alter table public.contacts
  add column if not exists email_status text not null default 'unknown',
  add column if not exists email_status_at timestamptz,
  add column if not exists email_status_reason text;
do $$ begin
  alter table public.contacts add constraint contacts_email_status_check check (email_status in ('unknown', 'valid', 'bounced', 'complained'));
exception when duplicate_object then null; end $$;

create or replace function public.northsea_outbound_block_reason(p_company_id uuid, p_contact_id uuid, p_email text, p_opportunity_id uuid)
returns text language sql stable security definer set search_path = public as $$
  with partij as (
    select p_company_id as company_id
    union select company_id from contacts where id = p_contact_id
    union select company_id from contacts where p_email is not null and lower(btrim(email)) = lower(btrim(p_email))
  ), r as (
    select case c.contact_policy when 'do_not_contact' then 1 when 'review_required' then 3 else 9 end as rang
      from companies c where c.id in (select company_id from partij where company_id is not null)
    union all
    select case when c.is_synthetic then 1.5 else 9 end
      from companies c where c.id in (select company_id from partij where company_id is not null)
    union all
    select case k.contact_policy when 'do_not_contact' then 1 when 'review_required' then 3 else 9 end
      from contacts k where k.id = p_contact_id or (p_email is not null and lower(btrim(k.email)) = lower(btrim(p_email)))
    union all
    -- P1: een adres dat bounced is wordt nooit automatisch opnieuw geprobeerd (alleen bij een bekend adres).
    select case when k.email_status in ('bounced', 'complained') then 2 else 9 end
      from contacts k where p_email is not null and lower(btrim(k.email)) = lower(btrim(p_email))
    union all
    select case when o.is_synthetic then 1.5 else 9 end from opportunities o where o.id = p_opportunity_id
    union all
    select case northsea_pair_block_reason(o.buyer_requirement_id, o.supplier_offer_id)
             when 'do_not_contact' then 1 when 'synthetic' then 1.5 when 'review_required' then 3 else 9 end
      from opportunities o where o.id = p_opportunity_id
  )
  select case min(rang) when 1 then 'do_not_contact' when 1.5 then 'synthetic' when 2 then 'bounced_channel' when 3 then 'review_required' end from r;
$$;

create or replace function public.northsea_reply_drafts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reden text;
  wissel boolean := tg_op = 'INSERT' or old.approval_status is distinct from new.approval_status;
begin
  if tg_op = 'INSERT' and new.approval_status in ('approved', 'sent') then
    raise exception 'NS_APPROVAL_INTEGRITY: a draft cannot be created as approved or sent';
  end if;
  if new.approval_status = 'approved' and wissel then
    if new.approval_actor_type is distinct from 'human' or coalesce(btrim(new.approved_by), '') = ''
       or new.approval_channel is null or new.approved_at is null then
      raise exception 'NS_APPROVAL_INTEGRITY: approval requires approval_actor_type=human, approved_by, approval_channel and approved_at';
    end if;
  end if;
  if new.approval_status = 'not_required' then
    if tg_op = 'UPDATE' and old.approval_status is distinct from 'not_required' then
      raise exception 'NS_APPROVAL_INTEGRITY: an existing draft cannot be converted to policy-allowed';
    end if;
    if new.policy_decision is null or coalesce((new.policy_decision ->> 'allowed')::boolean, false) is not true then
      raise exception 'NS_APPROVAL_INTEGRITY: policy-allowed draft requires a policy_decision with allowed=true';
    end if;
    if new.approved_by is not null or new.approval_actor_type is not null or new.approval_channel is not null then
      raise exception 'NS_APPROVAL_INTEGRITY: an automated draft cannot carry human approval fields';
    end if;
    if tg_op = 'INSERT' and not northsea_policy_allows('auto_qualification_reply') then
      raise exception 'NS_POLICY: automated send is disabled by deal_automation_policy';
    end if;
  end if;
  if new.approval_actor_type = 'human' and new.approval_status not in ('approved', 'sent') then
    raise exception 'NS_APPROVAL_INTEGRITY: human approval fields on a draft that is not approved';
  end if;
  if tg_op = 'UPDATE' and old.approval_actor_type is not null and new.approval_actor_type is distinct from old.approval_actor_type
     and new.approval_status = old.approval_status then
    raise exception 'NS_APPROVAL_INTEGRITY: approval provenance is immutable';
  end if;
  if tg_op = 'INSERT' and new.lifecycle_state is null then
    new.lifecycle_state := case new.approval_status when 'pending' then 'approval_required'
                                                    when 'not_required' then 'policy_allowed'
                                                    when 'rejected' then 'rejected' else 'drafted' end;
  end if;
  -- Contactbeleid: alleen voor een draft die nog kan worden verstuurd.
  if new.approval_status in ('pending', 'approved', 'not_required') and new.sent_at is null and new.resend_email_id is null
     and (wissel or old.to_email is distinct from new.to_email or old.company_id is distinct from new.company_id
          or old.contact_id is distinct from new.contact_id or old.opportunity_id is distinct from new.opportunity_id) then
    reden := northsea_outbound_block_reason(new.company_id, new.contact_id, new.to_email, new.opportunity_id);
    if reden in ('do_not_contact', 'synthetic', 'bounced_channel') then
      raise exception 'NS_CONTACT_POLICY: draft blocked (%)', reden;
    end if;
    if reden = 'review_required' and new.approval_status = 'not_required' then
      raise exception 'NS_CONTACT_POLICY: automated draft blocked (review_required)';
    end if;
  end if;
  return new;
end $$;

create or replace function public.northsea_communications_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reden text;
  d record;
  ontvanger text;
begin
  if tg_op = 'INSERT' and new.direction = 'outbound' and new.channel = 'email' then
    if new.from_address is distinct from 'NorthSea Commodity Partners <trade@northseacommodity.com>'
       or new.reply_to_address is distinct from 'trade@northseacommodity.com'
       or new.transport is distinct from 'resend'
       or coalesce(btrim(new.external_message_id), '') = ''
       or coalesce(btrim(new.actor), '') = '' or new.actor_type is null or new.approval_basis is null then
      raise exception 'NS_OUTBOUND_PROVENANCE: outbound email requires canonical from/reply-to, transport=resend, provider message id, actor, actor_type and approval_basis';
    end if;
    if new.approval_basis in ('human_approved_draft', 'policy_allowed') then
      select * into d from reply_drafts where id = new.reply_draft_id;
      if not found then
        raise exception 'NS_OUTBOUND_PROVENANCE: approval_basis % requires reply_draft_id', new.approval_basis;
      end if;
      ontvanger := d.to_email;
      if new.approval_basis = 'human_approved_draft'
         and not (d.approval_status in ('approved', 'sent') and d.approval_actor_type = 'human' and coalesce(btrim(d.approved_by), '') <> '') then
        raise exception 'NS_OUTBOUND_PROVENANCE: draft has no human approval provenance';
      end if;
      if new.approval_basis = 'policy_allowed'
         and not (d.approval_status = 'not_required' and coalesce((d.policy_decision ->> 'allowed')::boolean, false)) then
        raise exception 'NS_OUTBOUND_PROVENANCE: draft has no allowing policy decision';
      end if;
    end if;
    if new.approval_basis = 'policy_allowed' and not northsea_policy_allows('auto_qualification_reply') then
      raise exception 'NS_POLICY: automated send is disabled by deal_automation_policy';
    end if;
    if new.approval_basis = 'system_acknowledgement' and not northsea_policy_allows('system_acknowledgement') then
      raise exception 'NS_POLICY: automated acknowledgement is disabled by deal_automation_policy';
    end if;
    reden := northsea_outbound_block_reason(new.company_id, new.contact_id, ontvanger, new.opportunity_id);
    if reden in ('do_not_contact', 'synthetic', 'bounced_channel') or (reden = 'review_required' and new.approval_basis = 'policy_allowed') then
      raise exception 'NS_CONTACT_POLICY: outbound email blocked (%)', reden;
    end if;
  end if;
  if tg_op = 'UPDATE' and (old.from_address, old.reply_to_address, old.transport, old.actor, old.actor_type, old.approval_basis, old.reply_draft_id)
       is distinct from (new.from_address, new.reply_to_address, new.transport, new.actor, new.actor_type, new.approval_basis, new.reply_draft_id) then
    raise exception 'NS_OUTBOUND_PROVENANCE: provenance is immutable; historical unknowns stay unknown';
  end if;
  return new;
end $$;

alter table public.email_intelligence
  add column if not exists engine_primary text,
  add column if not exists engine_categories text[],
  add column if not exists engine_terms jsonb,
  add column if not exists engine_missing jsonb,
  add column if not exists engine_urgency text,
  add column if not exists engine_risk text,
  add column if not exists engine_reasons jsonb,
  add column if not exists engine_version text,
  add column if not exists engine_evaluated_at timestamptz;
do $$ begin
  alter table public.email_intelligence add constraint email_intelligence_engine_primary_check check (engine_primary is null or engine_primary in
    ('buyer', 'supplier', 'reply', 'qualification', 'documents_evidence', 'commercial_terms', 'logistics', 'payment', 'rejection', 'bounce_failure', 'spam_noise', 'ambiguous'));
exception when duplicate_object then null; end $$;

alter table public.opportunities
  add column if not exists engine_blocker_code text,
  add column if not exists engine_blocker text,
  add column if not exists engine_next_action_code text,
  add column if not exists engine_next_action text,
  add column if not exists engine_owner text,
  add column if not exists engine_reasons jsonb,
  add column if not exists engine_evaluated_at timestamptz;

create table if not exists public.northsea_followups (
  id uuid primary key default gen_random_uuid(),
  anchor_communication_id uuid not null references public.communications(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  attempt int not null check (attempt between 1 and 10),
  due_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'draft_created', 'replied', 'cancelled', 'blocked', 'expired')),
  draft_id uuid references public.reply_drafts(id) on delete set null,
  reason text,
  engine_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anchor_communication_id, attempt)
);
alter table public.northsea_followups enable row level security;
revoke all on public.northsea_followups from anon, authenticated;
create index if not exists northsea_followups_status_idx on public.northsea_followups (status, due_at);

alter table public.action_queue add column if not exists dedupe_key text;
create unique index if not exists action_queue_dedupe_open_uidx on public.action_queue (dedupe_key)
  where dedupe_key is not null and status in ('open', 'in_progress', 'waiting');

create unique index if not exists deal_evidence_engine_source_uidx on public.deal_evidence (opportunity_id, evidence_type, source_reference)
  where source_type = 'email' and evidence_type like 'stated_%';
