-- NorthSea P0-C: data volgens het contact- en testbeleid. Niets wordt verwijderd;
-- elke wijziging krijgt een reden en een audit-regel. Draait NA P0-B, zodat de
-- audit-triggers meeschrijven.

-- ── P0.5 ABAKUS: do-not-contact (door Luka bevestigd) ───────────────────────
update public.companies
   set contact_policy = 'do_not_contact',
       contact_policy_reason = 'ABAKUS explicitly declined intermediary involvement (inbound reply 2026-09-12). Do-not-contact confirmed by Luka, 2026-09-16.',
       contact_policy_set_at = now(),
       contact_policy_set_by = 'luka (P0 remediation instruction 2026-09-16)'
 where id in ('2991d3a0-e15e-4158-b7b8-9a798d3b9476', 'f5008747-2a96-4c84-b308-e7ae4670ee2f')
   and contact_policy <> 'do_not_contact';

-- Een openstaande draft aan ABAKUS kan niet meer verstuurd worden: geblokkeerd
-- door beleid (geen menselijke afwijzing; dat staat in policy_decision).
update public.reply_drafts
   set approval_status = 'rejected', lifecycle_state = 'blocked', approved_at = null,
       policy_decision = jsonb_build_object('allowed', false, 'reasons', jsonb_build_array('contact_policy:do_not_contact'),
                                            'decided_by', 'p0-remediation', 'decided_at', now()),
       updated_at = now()
 where company_id in ('2991d3a0-e15e-4158-b7b8-9a798d3b9476', 'f5008747-2a96-4c84-b308-e7ae4670ee2f')
   and approval_status in ('pending', 'approved') and sent_at is null and resend_email_id is null;

-- ── Tegenpartij die expliciet geen tussenpersonen wil (companies.notes) ─────
-- Niet door Luka als DNC bevestigd -> review_required: geen automatisering, wel
-- een menselijke beslissing mogelijk.
update public.companies
   set contact_policy = 'review_required',
       contact_policy_reason = 'Recorded RFQ note: counterparty requests direct sellers and no intermediaries/brokers. Automated outreach blocked pending Luka review.',
       contact_policy_set_at = now(),
       contact_policy_set_by = 'p0-remediation (from companies.notes)'
 where id = 'b6c0e69a-3a8b-40ff-953c-b1b83e017c1a' and contact_policy = 'allowed';

-- Haar deal: automatisering uit, open automatiseringswerk geannuleerd (historie blijft).
update public.opportunities set automation_status = 'disabled'
 where id = '3b817c9e-7549-44f8-aa4b-4752b9d21006' and coalesce(automation_status, '') <> 'disabled';
update public.deal_tasks
   set status = 'cancelled', completed_at = now(), updated_at = now(),
       result = coalesce(result, '{}'::jsonb) || jsonb_build_object('cancelled_by', 'p0-remediation', 'cancelled_at', now(),
                'cancelled_reason', 'Counterparty requested no intermediaries (contact_policy=review_required). Automated work stopped pending review.')
 where opportunity_id = '3b817c9e-7549-44f8-aa4b-4752b9d21006' and status in ('open', 'waiting', 'in_progress');
update public.action_queue
   set status = 'cancelled', completed_at = now(), updated_at = now(),
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelled_by', 'p0-remediation', 'cancelled_at', now(),
                'cancelled_reason', 'Counterparty requested no intermediaries (contact_policy=review_required). Automated work stopped pending review.')
 where opportunity_id = '3b817c9e-7549-44f8-aa4b-4752b9d21006' and status in ('open', 'waiting', 'in_progress');
insert into public.deal_events (opportunity_id, event_type, actor, summary, metadata)
select '3b817c9e-7549-44f8-aa4b-4752b9d21006', 'contact_policy_enforced', 'p0-remediation',
       'Automation disabled and open automated work cancelled: counterparty requested no intermediaries (review_required).',
       jsonb_build_object('company_id', 'b6c0e69a-3a8b-40ff-953c-b1b83e017c1a', 'contact_policy', 'review_required')
 where exists (select 1 from public.opportunities where id = '3b817c9e-7549-44f8-aa4b-4752b9d21006')
   and not exists (select 1 from public.deal_events where opportunity_id = '3b817c9e-7549-44f8-aa4b-4752b9d21006' and event_type = 'contact_policy_enforced');

-- ── P0.6 Synthetische testcase (Hamburg/Jasmine) ─────────────────────────────
-- Eerst de campagne stoppen (een actieve synthetische campagne mag niet bestaan).
update public.sourcing_campaigns
   set status = 'cancelled', updated_at = now(),
       next_action = 'Cancelled 2026-09-16: linked to the internal synthetic STRATO/Jasmine testcase. Not genuine demand.'
 where buyer_requirement_id = '7c328c1a-fd41-4592-86bb-de954a384e2b' and status <> 'cancelled';
update public.sourcing_campaigns
   set is_synthetic = true, synthetic_reason = 'Campaign for the internal STRATO/Jasmine testcase requirement.'
 where buyer_requirement_id = '7c328c1a-fd41-4592-86bb-de954a384e2b' and not is_synthetic;
update public.buyer_requirements
   set is_synthetic = true, synthetic_reason = 'Internal testcase: STRATO/Jasmine synthetic qualification call (Hamburg). Not genuine demand.'
 where id = '7c328c1a-fd41-4592-86bb-de954a384e2b' and not is_synthetic;
update public.companies
   set is_synthetic = true, synthetic_reason = 'Created by the STRATO AI call test (source_type strato_ai_call_test).'
 where id = '87ffe089-cd26-4cda-be74-616a62ab8a2a' and not is_synthetic;
update public.call_intelligence
   set is_synthetic = true, synthetic_reason = 'raw_event.test = true (test call).'
 where id = '0dd331cb-8319-4a2b-837c-88444496daab' and not is_synthetic;
update public.communications
   set is_synthetic = true, synthetic_reason = 'Communication of the test call (call_intelligence raw_event.test = true).'
 where id = '44eb862a-d697-44f3-9e66-cdc97e844119' and not is_synthetic;
update public.communications
   set is_synthetic = true, synthetic_reason = 'Internal test email (subject starts with TEST).'
 where id in ('9d47e7ae-06e4-49e3-9553-3bd6812492a9', '4a7d4def-7d3f-482c-9f9f-23d4a1e4dbac', '7d39ac2e-da25-4fe5-89e9-5b1675b6fb2f',
              'ae2bab46-292d-4c27-a6df-4e3097dc1fb7', 'cd24ff64-7f04-4d24-9c6d-793c51336778', 'aa9f8e07-d087-4ba4-b227-062da80d27d9',
              '7f2cc24a-c3db-4cb4-87cb-450e01db0ca8')
   and not is_synthetic;

insert into public.northsea_audit_events (actor_type, actor, action, details)
values ('system', 'p0-remediation', 'p0_data_remediation_applied',
        jsonb_build_object('migration', '20260916150200_p0_c_data',
                           'abakus_companies', jsonb_build_array('2991d3a0-e15e-4158-b7b8-9a798d3b9476', 'f5008747-2a96-4c84-b308-e7ae4670ee2f'),
                           'review_required_company', 'b6c0e69a-3a8b-40ff-953c-b1b83e017c1a',
                           'disabled_opportunity', '3b817c9e-7549-44f8-aa4b-4752b9d21006',
                           'synthetic_requirement', '7c328c1a-fd41-4592-86bb-de954a384e2b',
                           'synthetic_company', '87ffe089-cd26-4cda-be74-616a62ab8a2a'));
