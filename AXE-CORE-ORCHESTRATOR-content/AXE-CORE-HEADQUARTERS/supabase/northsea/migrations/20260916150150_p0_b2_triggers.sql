-- NorthSea P0-B2 (triggers): pas NA het uitrollen van de nieuwe edge functions, zodat geen oude
-- functie eerst verstuurt en daarna door een trigger wordt geweigerd. Zie B1 voor foutcodes.

-- ── reply_drafts: goedkeuringsintegriteit + contactbeleid ───────────────────
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
    if reden in ('do_not_contact', 'synthetic') then
      raise exception 'NS_CONTACT_POLICY: draft blocked (%)', reden;
    end if;
    if reden = 'review_required' and new.approval_status = 'not_required' then
      raise exception 'NS_CONTACT_POLICY: automated draft blocked (review_required)';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists northsea_reply_drafts_guard on public.reply_drafts;
create trigger northsea_reply_drafts_guard before insert or update on public.reply_drafts
  for each row execute function public.northsea_reply_drafts_guard();

create or replace function public.northsea_reply_drafts_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.approval_status is distinct from new.approval_status then
    insert into northsea_audit_events (actor_type, actor, action, policy_decision, approval_identity, communication_id,
                                       opportunity_id, company_id, contact_id, draft_id, details)
    values (case when new.approval_status in ('approved') then 'human'
                 when new.approval_status = 'not_required' then 'automation' else 'system' end,
            coalesce(new.approved_by, new.generated_by, 'unknown'),
            'draft_' || new.approval_status || case when tg_op = 'INSERT' then '_created' else '' end,
            new.policy_decision, case when new.approval_actor_type = 'human' then new.approved_by end,
            new.communication_id, new.opportunity_id, new.company_id, new.contact_id, new.id,
            jsonb_build_object('lifecycle_state', new.lifecycle_state, 'approval_channel', new.approval_channel,
                               'previous_status', case when tg_op = 'UPDATE' then old.approval_status end,
                               'previous_approved_by', case when tg_op = 'UPDATE' then old.approved_by end,
                               'sensitive_action', new.sensitive_action));
  end if;
  return null;
end $$;
drop trigger if exists northsea_reply_drafts_audit on public.reply_drafts;
create trigger northsea_reply_drafts_audit after insert or update on public.reply_drafts
  for each row execute function public.northsea_reply_drafts_audit();

-- ── communications: verzend-herkomst + contactbeleid ────────────────────────
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
    if reden in ('do_not_contact', 'synthetic') or (reden = 'review_required' and new.approval_basis = 'policy_allowed') then
      raise exception 'NS_CONTACT_POLICY: outbound email blocked (%)', reden;
    end if;
  end if;
  if tg_op = 'UPDATE' and (old.from_address, old.reply_to_address, old.transport, old.actor, old.actor_type, old.approval_basis, old.reply_draft_id)
       is distinct from (new.from_address, new.reply_to_address, new.transport, new.actor, new.actor_type, new.approval_basis, new.reply_draft_id) then
    raise exception 'NS_OUTBOUND_PROVENANCE: provenance is immutable; historical unknowns stay unknown';
  end if;
  return new;
end $$;
drop trigger if exists northsea_communications_guard on public.communications;
create trigger northsea_communications_guard before insert or update on public.communications
  for each row execute function public.northsea_communications_guard();

-- ── Werk (taken, queue): geen open werk op DNC/synthetische deals ───────────
-- Uitzondering: beoordelings- en afsluitwerk mag wel (dnc_review, manual_review, close_out, contact_policy_review).
create or replace function public.northsea_work_item_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  soort text := coalesce(to_jsonb(new) ->> 'task_type', to_jsonb(new) ->> 'action_type');
  bedrijf uuid := nullif(to_jsonb(new) ->> 'company_id', '')::uuid;
  reden text;
begin
  if new.status in ('open', 'in_progress', 'waiting')
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.opportunity_id is distinct from new.opportunity_id)
     and soort not in ('dnc_review', 'manual_review', 'close_out', 'contact_policy_review') then
    reden := northsea_outbound_block_reason(bedrijf, null, null, new.opportunity_id);
    if reden in ('do_not_contact', 'synthetic') then
      raise exception 'NS_CONTACT_POLICY: % blocked on % record', tg_table_name, reden;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists northsea_work_item_guard on public.deal_tasks;
create trigger northsea_work_item_guard before insert or update on public.deal_tasks
  for each row execute function public.northsea_work_item_guard();
drop trigger if exists northsea_work_item_guard on public.action_queue;
create trigger northsea_work_item_guard before insert or update on public.action_queue
  for each row execute function public.northsea_work_item_guard();

-- ── Campagnes en kandidaten ──────────────────────────────────────────────────
create or replace function public.northsea_campaign_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare reden text;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status
     or old.buyer_requirement_id is distinct from new.buyer_requirement_id or old.supplier_offer_id is distinct from new.supplier_offer_id) then
    if new.is_synthetic then
      raise exception 'NS_SYNTHETIC: a synthetic campaign cannot be active';
    end if;
    reden := northsea_pair_block_reason(new.buyer_requirement_id, new.supplier_offer_id);
    if reden in ('do_not_contact', 'synthetic') then
      raise exception 'NS_CONTACT_POLICY: campaign activation blocked (%)', reden;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists northsea_campaign_guard on public.sourcing_campaigns;
create trigger northsea_campaign_guard before insert or update on public.sourcing_campaigns
  for each row execute function public.northsea_campaign_guard();

create or replace function public.northsea_candidate_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare reden text;
begin
  if new.status = 'contacted' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    reden := northsea_outbound_block_reason(new.company_id, new.contact_id, null, null);
    if reden in ('do_not_contact', 'synthetic') then
      raise exception 'NS_CONTACT_POLICY: candidate outreach blocked (%)', reden;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists northsea_candidate_guard on public.sourcing_candidates;
create trigger northsea_candidate_guard before insert or update on public.sourcing_candidates
  for each row execute function public.northsea_candidate_guard();

-- ── Opportunities: automatisering uit bij DNC/synthetic/review; geen live deal uit testdata ──
create or replace function public.northsea_opportunity_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare reden text;
begin
  reden := northsea_pair_block_reason(new.buyer_requirement_id, new.supplier_offer_id);
  if tg_op = 'INSERT' and reden = 'synthetic' and not new.is_synthetic then
    raise exception 'NS_SYNTHETIC: a live opportunity cannot be created from synthetic records';
  end if;
  if (reden is not null or new.is_synthetic) and coalesce(new.automation_status, '') in ('active', 'pending', 'waiting') then
    new.automation_status := 'disabled';
  end if;
  return new;
end $$;
drop trigger if exists northsea_opportunity_guard on public.opportunities;
create trigger northsea_opportunity_guard before insert or update on public.opportunities
  for each row execute function public.northsea_opportunity_guard();

-- ── Audit bij beleidswijzigingen ─────────────────────────────────────────────
create or replace function public.northsea_policy_change_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare oud jsonb := to_jsonb(old); nieuw jsonb := to_jsonb(new);
begin
  if (oud ->> 'contact_policy') is distinct from (nieuw ->> 'contact_policy')
     or (oud ->> 'is_synthetic') is distinct from (nieuw ->> 'is_synthetic') then
    insert into northsea_audit_events (actor_type, actor, action, company_id, contact_id, details)
    values ('system', coalesce(nieuw ->> 'contact_policy_set_by', 'unknown'), tg_table_name || '_policy_changed',
            case when tg_table_name = 'companies' then new.id end,
            case when tg_table_name = 'contacts' then new.id end,
            jsonb_build_object('contact_policy', jsonb_build_object('from', oud ->> 'contact_policy', 'to', nieuw ->> 'contact_policy'),
                               'reason', nieuw ->> 'contact_policy_reason',
                               'is_synthetic', jsonb_build_object('from', oud ->> 'is_synthetic', 'to', nieuw ->> 'is_synthetic'),
                               'synthetic_reason', nieuw ->> 'synthetic_reason'));
  end if;
  return null;
end $$;
drop trigger if exists northsea_policy_change_audit on public.companies;
create trigger northsea_policy_change_audit after update on public.companies
  for each row execute function public.northsea_policy_change_audit();
drop trigger if exists northsea_policy_change_audit on public.contacts;
create trigger northsea_policy_change_audit after update on public.contacts
  for each row execute function public.northsea_policy_change_audit();
