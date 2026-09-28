-- Test van de P0-guards. Draait in ÉÉN transactie die altijd terugrolt: het blok
-- eindigt met RAISE 'NS_TESTS_PASSED: n' (of faalt eerder met NS_TEST_FAILED),
-- zodat niets van de testrijen blijft staan. Veilig tegen productie.
-- Gebruik: supabase/northsea/tools/run_sql_tests.py (voert migraties A+B+C + dit bestand uit in één transactie).
do $test$
declare
  n int := 0;
  dnc_co uuid; rev_co uuid; ok_co uuid; syn_co uuid; dnc_contact_co uuid; dnc_contact uuid;
  req_ok uuid; off_ok uuid; req_syn uuid; req_dnc uuid;
  opp_ok uuid; opp_syn uuid; opp_dnc uuid;
  comm_ok uuid; comm_dnc uuid;
  d_ok uuid; d_auto uuid; d_rev uuid;
  camp uuid; x uuid; st text; aantal int;
begin
  -- ── Fixtures ──
  insert into companies (company_name, company_type, contact_policy, contact_policy_reason) values ('NS TEST DNC Co', 'buyer', 'do_not_contact', 'test') returning id into dnc_co;
  insert into companies (company_name, company_type, contact_policy, contact_policy_reason) values ('NS TEST Review Co', 'buyer', 'review_required', 'test') returning id into rev_co;
  insert into companies (company_name, company_type) values ('NS TEST Allowed Co', 'supplier') returning id into ok_co;
  insert into companies (company_name, company_type, is_synthetic, synthetic_reason) values ('NS TEST Synthetic Co', 'buyer', true, 'test') returning id into syn_co;
  insert into companies (company_name, company_type) values ('NS TEST Contact-DNC Co', 'supplier') returning id into dnc_contact_co;
  insert into contacts (company_id, email, contact_policy) values (dnc_contact_co, 'bounced@ns-test.invalid', 'do_not_contact') returning id into dnc_contact;
  insert into buyer_requirements (company_id, commodity, product) values (ok_co, 'Copper', 'Copper Cathode') returning id into req_ok;
  insert into supplier_offers (company_id, commodity, product) values (ok_co, 'Copper', 'Copper Cathode') returning id into off_ok;
  insert into buyer_requirements (company_id, commodity, product, is_synthetic) values (ok_co, 'Copper', 'Copper Cathode', true) returning id into req_syn;
  insert into buyer_requirements (company_id, commodity, product) values (dnc_co, 'Copper', 'Copper Cathode') returning id into req_dnc;
  insert into opportunities (buyer_requirement_id, supplier_offer_id, stage, automation_status) values (req_ok, off_ok, 'identified', 'active') returning id into opp_ok;
  insert into opportunities (buyer_requirement_id, supplier_offer_id, stage, automation_status) values (req_dnc, off_ok, 'identified', 'active') returning id into opp_dnc;
  insert into communications (company_id, direction, channel, subject, occurred_at) values (ok_co, 'inbound', 'email', 'NS TEST inbound', now()) returning id into comm_ok;
  insert into communications (company_id, direction, channel, subject, occurred_at) values (dnc_co, 'inbound', 'email', 'NS TEST inbound dnc', now()) returning id into comm_dnc;

  -- 1. Beslisfunctie: ernst en bronnen
  if northsea_outbound_block_reason(dnc_co, null, null, null) is distinct from 'do_not_contact' then raise exception 'NS_TEST_FAILED: company dnc'; end if; n := n + 1;
  if northsea_outbound_block_reason(rev_co, null, null, null) is distinct from 'review_required' then raise exception 'NS_TEST_FAILED: review'; end if; n := n + 1;
  if northsea_outbound_block_reason(syn_co, null, null, null) is distinct from 'synthetic' then raise exception 'NS_TEST_FAILED: synthetic co'; end if; n := n + 1;
  if northsea_outbound_block_reason(ok_co, null, null, null) is not null then raise exception 'NS_TEST_FAILED: allowed co'; end if; n := n + 1;
  if northsea_outbound_block_reason(null, null, 'BOUNCED@ns-test.invalid', null) is distinct from 'do_not_contact' then raise exception 'NS_TEST_FAILED: contact dnc by email'; end if; n := n + 1;
  if northsea_outbound_block_reason(null, null, null, opp_dnc) is distinct from 'do_not_contact' then raise exception 'NS_TEST_FAILED: opp dnc'; end if; n := n + 1;
  if northsea_pair_block_reason(req_syn, off_ok) is distinct from 'synthetic' then raise exception 'NS_TEST_FAILED: pair synthetic'; end if; n := n + 1;

  -- 2. Opportunity: DNC zet automatisering uit; geen live deal uit synthetische vraag
  select automation_status into st from opportunities where id = opp_dnc;
  if st is distinct from 'disabled' then raise exception 'NS_TEST_FAILED: dnc opp automation not disabled (%)', st; end if; n := n + 1;
  begin
    insert into opportunities (buyer_requirement_id, supplier_offer_id, stage) values (req_syn, off_ok, 'identified');
    raise exception 'NS_TEST_FAILED: live opp from synthetic accepted';
  exception when others then if sqlerrm not like 'NS_SYNTHETIC%' then raise; end if; end; n := n + 1;
  insert into opportunities (buyer_requirement_id, supplier_offer_id, stage, is_synthetic, automation_status)
    values (req_syn, off_ok, 'identified', true, 'active') returning id into opp_syn;
  select automation_status into st from opportunities where id = opp_syn;
  if st is distinct from 'disabled' then raise exception 'NS_TEST_FAILED: synthetic opp automation'; end if; n := n + 1;
  update opportunities set automation_status = 'active' where id = opp_dnc;
  select automation_status into st from opportunities where id = opp_dnc;
  if st is distinct from 'disabled' then raise exception 'NS_TEST_FAILED: dnc opp re-enabled'; end if; n := n + 1;

  -- 3. Goedkeuringsintegriteit
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by)
      values (comm_ok, ok_co, 'a@ns-test.invalid', 's', 'b', 'approved', 'test');
    raise exception 'NS_TEST_FAILED: born approved';
  exception when others then if sqlerrm not like 'NS_APPROVAL_INTEGRITY%' then raise; end if; end; n := n + 1;
  insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by)
    values (comm_ok, ok_co, 'a@ns-test.invalid', 's', 'b', 'pending', 'test') returning id into d_ok;
  select lifecycle_state into st from reply_drafts where id = d_ok;
  if st is distinct from 'approval_required' then raise exception 'NS_TEST_FAILED: lifecycle default'; end if; n := n + 1;
  begin
    update reply_drafts set approval_status = 'approved', approved_at = now() where id = d_ok;
    raise exception 'NS_TEST_FAILED: approval without human provenance';
  exception when others then if sqlerrm not like 'NS_APPROVAL_INTEGRITY%' then raise; end if; end; n := n + 1;
  begin
    update reply_drafts set approval_status = 'approved', approved_at = now(), approval_actor_type = 'unknown', approved_by = 'x', approval_channel = 'deal_desk' where id = d_ok;
    raise exception 'NS_TEST_FAILED: approval with non-human actor';
  exception when others then if sqlerrm not like 'NS_APPROVAL_INTEGRITY%' then raise; end if; end; n := n + 1;
  update reply_drafts set approval_status = 'approved', approved_at = now(), approval_actor_type = 'human', approved_by = 'luka', approval_channel = 'deal_desk', lifecycle_state = 'human_approved' where id = d_ok;
  n := n + 1;
  select count(*) into aantal from northsea_audit_events where draft_id = d_ok and action = 'draft_approved' and approval_identity = 'luka' and actor_type = 'human';
  if aantal <> 1 then raise exception 'NS_TEST_FAILED: approval audit missing'; end if; n := n + 1;
  begin
    update reply_drafts set approval_actor_type = 'unknown' where id = d_ok;
    raise exception 'NS_TEST_FAILED: provenance mutable';
  exception when others then if sqlerrm not like 'NS_APPROVAL_INTEGRITY%' then raise; end if; end; n := n + 1;
  -- 3a. Beleid staat UIT (productie): geen automatische draft, geen automatische bevestiging.
  if northsea_policy_allows('auto_qualification_reply') or northsea_policy_allows('system_acknowledgement') then
    raise exception 'NS_TEST_FAILED: production policy unexpectedly allows automation'; end if; n := n + 1;
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by, policy_decision)
      values (comm_ok, ok_co, 'a@ns-test.invalid', 's', 'b', 'not_required', 'test', '{"allowed": true}');
    raise exception 'NS_TEST_FAILED: automated draft while auto_send_qualification=false';
  exception when others then if sqlerrm not like 'NS_POLICY%' then raise; end if; end; n := n + 1;
  begin
    insert into communications (company_id, direction, channel, subject, external_message_id, occurred_at, from_address, reply_to_address, transport, actor, actor_type, approval_basis)
      values (ok_co, 'outbound', 'email', 's', 'prov-ack', now(), 'NorthSea Commodity Partners <trade@northseacommodity.com>', 'trade@northseacommodity.com', 'resend', 'commodity-intake', 'automation', 'system_acknowledgement');
    raise exception 'NS_TEST_FAILED: automated acknowledgement while auto_reply_nonbinding=false';
  exception when others then if sqlerrm not like 'NS_POLICY%' then raise; end if; end; n := n + 1;
  update deal_automation_policy set auto_send_qualification = true, auto_reply_nonbinding = false, operational_mailbox = 'trade@northseacommodity.com' where id = 1;
  if northsea_policy_allows('auto_qualification_reply') then raise exception 'NS_TEST_FAILED: auto_reply_nonbinding=false must block'; end if; n := n + 1;
  update deal_automation_policy set auto_send_qualification = false, auto_reply_nonbinding = true where id = 1;
  if northsea_policy_allows('auto_qualification_reply') then raise exception 'NS_TEST_FAILED: auto_send_qualification=false must block'; end if; n := n + 1;
  update deal_automation_policy set auto_send_qualification = true, auto_reply_nonbinding = true, operational_mailbox = null where id = 1;
  if northsea_policy_allows('auto_qualification_reply') then raise exception 'NS_TEST_FAILED: missing mailbox must block'; end if; n := n + 1;
  -- 3b. Vanaf hier: beleid tijdelijk AAN binnen de terugrollende transactie, om de overige regels te testen.
  update deal_automation_policy set auto_send_qualification = true, auto_reply_nonbinding = true, operational_mailbox = 'trade@northseacommodity.com' where id = 1;
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by, policy_decision)
      values (comm_ok, ok_co, 'a@ns-test.invalid', 's', 'b', 'not_required', 'test', '{"allowed": false}');
    raise exception 'NS_TEST_FAILED: not_required without allowing decision';
  exception when others then if sqlerrm not like 'NS_APPROVAL_INTEGRITY%' then raise; end if; end; n := n + 1;
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by, policy_decision, approved_by)
      values (comm_ok, ok_co, 'a@ns-test.invalid', 's', 'b', 'not_required', 'test', '{"allowed": true}', 'bot');
    raise exception 'NS_TEST_FAILED: automation masquerading as approver';
  exception when others then if sqlerrm not like 'NS_APPROVAL_INTEGRITY%' then raise; end if; end; n := n + 1;
  insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by, policy_decision)
    values (comm_ok, ok_co, 'a@ns-test.invalid', 's', 'b', 'not_required', 'test', '{"allowed": true}') returning id into d_auto;
  n := n + 1;
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by)
      values (comm_ok, ok_co, 'c@ns-test.invalid', 's', 'b', 'pending', 'test') returning id into x;
    update reply_drafts set approval_status = 'not_required', policy_decision = '{"allowed": true}' where id = x;
    raise exception 'NS_TEST_FAILED: pending converted to policy-allowed';
  exception when others then if sqlerrm not like 'NS_APPROVAL_INTEGRITY%' then raise; end if; end; n := n + 1;

  -- 4. DNC / synthetic / review op drafts
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by)
      values (comm_dnc, dnc_co, 'a@ns-test.invalid', 's', 'b', 'pending', 'test');
    raise exception 'NS_TEST_FAILED: draft to dnc company';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by)
      values (comm_ok, ok_co, 'Bounced@ns-test.invalid', 's', 'b', 'pending', 'test');
    raise exception 'NS_TEST_FAILED: draft to dnc contact email';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  begin
    insert into reply_drafts (communication_id, company_id, opportunity_id, to_email, subject, body, approval_status, generated_by)
      values (comm_ok, ok_co, opp_syn, 'a@ns-test.invalid', 's', 'b', 'pending', 'test');
    raise exception 'NS_TEST_FAILED: draft on synthetic opp';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  begin
    insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by, policy_decision)
      values (comm_ok, rev_co, 'a@ns-test.invalid', 's', 'b', 'not_required', 'test', '{"allowed": true}');
    raise exception 'NS_TEST_FAILED: automated draft to review_required';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  insert into reply_drafts (communication_id, company_id, to_email, subject, body, approval_status, generated_by)
    values (comm_ok, rev_co, 'a@ns-test.invalid', 's', 'b', 'pending', 'test') returning id into d_rev;
  n := n + 1;  -- review_required: een mens mag nog beslissen

  -- 5. Verzend-herkomst
  begin
    insert into communications (company_id, direction, channel, subject, external_message_id, occurred_at)
      values (ok_co, 'outbound', 'email', 's', 'prov-1', now());
    raise exception 'NS_TEST_FAILED: outbound without provenance';
  exception when others then if sqlerrm not like 'NS_OUTBOUND_PROVENANCE%' then raise; end if; end; n := n + 1;
  begin
    insert into communications (company_id, direction, channel, subject, external_message_id, occurred_at, from_address, reply_to_address, transport, actor, actor_type, approval_basis)
      values (ok_co, 'outbound', 'email', 's', 'prov-2', now(), 'Luka <lukadezeeuw205@gmail.com>', 'trade@northseacommodity.com', 'resend', 'x', 'service', 'system_acknowledgement');
    raise exception 'NS_TEST_FAILED: non-canonical sender';
  exception when others then if sqlerrm not like 'NS_OUTBOUND_PROVENANCE%' then raise; end if; end; n := n + 1;
  begin
    insert into communications (company_id, direction, channel, subject, external_message_id, occurred_at, from_address, reply_to_address, transport, actor, actor_type, approval_basis, reply_draft_id)
      values (ok_co, 'outbound', 'email', 's', 'prov-3', now(), 'NorthSea Commodity Partners <trade@northseacommodity.com>', 'trade@northseacommodity.com', 'resend', 'x', 'service', 'human_approved_draft', d_rev);
    raise exception 'NS_TEST_FAILED: human basis with unapproved draft';
  exception when others then if sqlerrm not like 'NS_OUTBOUND_PROVENANCE%' then raise; end if; end; n := n + 1;
  insert into communications (company_id, direction, channel, subject, external_message_id, occurred_at, from_address, reply_to_address, transport, actor, actor_type, approval_basis, reply_draft_id)
    values (ok_co, 'outbound', 'email', 's', 'prov-4', now(), 'NorthSea Commodity Partners <trade@northseacommodity.com>', 'trade@northseacommodity.com', 'resend', 'send-approved-reply', 'service', 'human_approved_draft', d_ok)
    returning id into x;
  n := n + 1;
  begin
    update communications set from_address = 'someone@else.invalid' where id = x;
    raise exception 'NS_TEST_FAILED: provenance mutable on communications';
  exception when others then if sqlerrm not like 'NS_OUTBOUND_PROVENANCE%' then raise; end if; end; n := n + 1;
  begin
    update communications set approval_basis = 'human_approved_draft' where direction = 'outbound' and approval_basis is null and id in (select id from communications where direction = 'outbound' and approval_basis is null limit 1);
    if found then raise exception 'NS_TEST_FAILED: historical provenance backfilled'; end if;
  exception when others then if sqlerrm not like 'NS_OUTBOUND_PROVENANCE%' and sqlerrm not like 'NS_TEST_FAILED%' then raise; end if;
    if sqlerrm like 'NS_TEST_FAILED%' then raise; end if; end; n := n + 1;
  begin
    insert into communications (company_id, direction, channel, subject, external_message_id, occurred_at, from_address, reply_to_address, transport, actor, actor_type, approval_basis)
      values (dnc_co, 'outbound', 'email', 's', 'prov-5', now(), 'NorthSea Commodity Partners <trade@northseacommodity.com>', 'trade@northseacommodity.com', 'resend', 'commodity-intake', 'automation', 'system_acknowledgement');
    raise exception 'NS_TEST_FAILED: outbound to dnc';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;

  -- 6. Werk, campagnes, kandidaten
  begin
    insert into deal_tasks (opportunity_id, task_type, title) values (opp_dnc, 'follow_up', 'NS TEST follow up');
    raise exception 'NS_TEST_FAILED: task on dnc opp';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  insert into deal_tasks (opportunity_id, task_type, title) values (opp_dnc, 'dnc_review', 'NS TEST review'); n := n + 1;
  begin
    insert into action_queue (opportunity_id, action_type, title) values (opp_syn, 'qualify_match', 'NS TEST queue');
    raise exception 'NS_TEST_FAILED: queue on synthetic opp';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  begin
    insert into action_queue (company_id, action_type, title) values (dnc_co, 'qualify_buyer', 'NS TEST queue co');
    raise exception 'NS_TEST_FAILED: queue on dnc company';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  insert into deal_tasks (opportunity_id, task_type, title) values (opp_ok, 'follow_up', 'NS TEST ok'); n := n + 1;
  begin
    insert into sourcing_campaigns (buyer_requirement_id, direction, commodity, status) values (req_syn, 'find_supplier', 'Copper', 'active');
    raise exception 'NS_TEST_FAILED: active campaign on synthetic requirement';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  insert into sourcing_campaigns (buyer_requirement_id, direction, commodity, status) values (req_ok, 'find_supplier', 'Copper', 'active') returning id into camp;
  n := n + 1;
  begin
    insert into sourcing_candidates (campaign_id, company_id, candidate_name, status) values (camp, dnc_co, 'x', 'contacted');
    raise exception 'NS_TEST_FAILED: dnc candidate contacted';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;

  -- 7. Productiedata na P0-C
  if (select count(*) from companies where id in ('2991d3a0-e15e-4158-b7b8-9a798d3b9476', 'f5008747-2a96-4c84-b308-e7ae4670ee2f') and contact_policy = 'do_not_contact') <> 2 then
    raise exception 'NS_TEST_FAILED: ABAKUS not do_not_contact'; end if; n := n + 1;
  if exists (select 1 from sourcing_campaigns where buyer_requirement_id = '7c328c1a-fd41-4592-86bb-de954a384e2b' and status = 'active') then
    raise exception 'NS_TEST_FAILED: testcase campaign still active'; end if; n := n + 1;
  if not (select is_synthetic from buyer_requirements where id = '7c328c1a-fd41-4592-86bb-de954a384e2b') then
    raise exception 'NS_TEST_FAILED: testcase requirement not synthetic'; end if; n := n + 1;
  if exists (select 1 from opportunities where id = '3b817c9e-7549-44f8-aa4b-4752b9d21006' and automation_status <> 'disabled') then
    raise exception 'NS_TEST_FAILED: no-intermediary deal automation active'; end if; n := n + 1;
  if exists (select 1 from deal_tasks where opportunity_id = '3b817c9e-7549-44f8-aa4b-4752b9d21006' and status in ('open','waiting','in_progress'))
     or exists (select 1 from action_queue where opportunity_id = '3b817c9e-7549-44f8-aa4b-4752b9d21006' and status in ('open','waiting','in_progress')) then
    raise exception 'NS_TEST_FAILED: open work on no-intermediary deal'; end if; n := n + 1;
  if exists (select 1 from reply_drafts where company_id in ('2991d3a0-e15e-4158-b7b8-9a798d3b9476','f5008747-2a96-4c84-b308-e7ae4670ee2f') and approval_status in ('pending','approved') and sent_at is null) then
    raise exception 'NS_TEST_FAILED: sendable ABAKUS draft'; end if; n := n + 1;
  if exists (select 1 from communications where direction = 'outbound' and approval_basis is not null and created_at < '2026-09-16') then
    raise exception 'NS_TEST_FAILED: historical provenance invented'; end if; n := n + 1;
  delete from deal_automation_policy where id = 1;
  if northsea_policy_allows('auto_qualification_reply') or northsea_policy_allows('system_acknowledgement') then
    raise exception 'NS_TEST_FAILED: missing policy row must fail closed'; end if; n := n + 1;

  raise exception 'NS_TESTS_PASSED: %', n;
end
$test$;
