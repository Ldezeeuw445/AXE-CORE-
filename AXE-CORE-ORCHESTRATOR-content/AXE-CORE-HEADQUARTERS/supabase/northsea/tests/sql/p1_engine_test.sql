-- P1-engine guards; rolt altijd terug (eindigt met NS_TESTS_PASSED).
do $test$
declare
  n int := 0; co uuid; ct uuid; req uuid; off uuid; opp uuid; comm uuid; d uuid; aantal int;
begin
  insert into companies (company_name, company_type) values ('NS P1 TEST Co', 'supplier') returning id into co;
  insert into contacts (company_id, email) values (co, 'bounce@ns-p1.invalid') returning id into ct;
  insert into buyer_requirements (company_id, commodity, product) values (co, 'Copper', 'Copper Cathode') returning id into req;
  insert into supplier_offers (company_id, commodity, product) values (co, 'Copper', 'Copper Cathode') returning id into off;
  insert into opportunities (buyer_requirement_id, supplier_offer_id, stage) values (req, off, 'identified') returning id into opp;
  insert into communications (company_id, contact_id, opportunity_id, direction, channel, subject, occurred_at)
    values (co, ct, opp, 'inbound', 'email', 'NS P1 TEST', now()) returning id into comm;

  if northsea_outbound_block_reason(co, ct, 'bounce@ns-p1.invalid', opp) is not null then raise exception 'NS_TEST_FAILED: clean contact blocked'; end if; n := n + 1;
  insert into reply_drafts (communication_id, company_id, contact_id, opportunity_id, to_email, subject, body, approval_status, generated_by)
    values (comm, co, ct, opp, 'bounce@ns-p1.invalid', 's', 'b', 'pending', 'test') returning id into d;
  n := n + 1;

  update contacts set email_status = 'bounced', email_status_at = now(), email_status_reason = 'test' where id = ct;
  if northsea_outbound_block_reason(null, null, 'BOUNCE@ns-p1.invalid', null) is distinct from 'bounced_channel' then raise exception 'NS_TEST_FAILED: bounced not detected'; end if; n := n + 1;
  if northsea_outbound_block_reason(co, null, null, opp) is not null then raise exception 'NS_TEST_FAILED: bounced must only block that address'; end if; n := n + 1;
  begin
    insert into reply_drafts (communication_id, company_id, contact_id, opportunity_id, to_email, subject, body, approval_status, generated_by)
      values (comm, co, ct, opp, 'bounce@ns-p1.invalid', 's2', 'b', 'pending', 'test');
    raise exception 'NS_TEST_FAILED: draft to bounced address accepted';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%bounced_channel%' then raise; end if; end; n := n + 1;
  begin
    update reply_drafts set approval_status = 'approved', approved_at = now(), approval_actor_type = 'human', approved_by = 'luka', approval_channel = 'deal_desk' where id = d;
    raise exception 'NS_TEST_FAILED: approving draft to bounced address accepted';
  exception when others then if sqlerrm not like 'NS_CONTACT_POLICY%' then raise; end if; end; n := n + 1;
  insert into deal_tasks (opportunity_id, task_type, title) values (opp, 'repair_contact_channel', 'find other channel'); n := n + 1;

  insert into northsea_followups (anchor_communication_id, opportunity_id, company_id, attempt, due_at) values (comm, opp, co, 1, now());
  begin
    insert into northsea_followups (anchor_communication_id, opportunity_id, company_id, attempt, due_at) values (comm, opp, co, 1, now());
    raise exception 'NS_TEST_FAILED: duplicate follow-up attempt';
  exception when unique_violation then null; end; n := n + 1;

  insert into action_queue (opportunity_id, action_type, title, dedupe_key) values (opp, 'review_mapping', 'x', 'p1test:key');
  begin
    insert into action_queue (opportunity_id, action_type, title, dedupe_key) values (opp, 'review_mapping', 'x', 'p1test:key');
    raise exception 'NS_TEST_FAILED: duplicate open chase item';
  exception when unique_violation then null; end; n := n + 1;
  update action_queue set status = 'completed' where dedupe_key = 'p1test:key';
  insert into action_queue (opportunity_id, action_type, title, dedupe_key) values (opp, 'review_mapping', 'x', 'p1test:key'); n := n + 1;

  insert into deal_evidence (opportunity_id, party_side, evidence_type, source_type, source_reference, claim, verification_status)
    values (opp, 'seller', 'stated_terms', 'email', comm::text, 'c', 'counterparty_stated');
  begin
    insert into deal_evidence (opportunity_id, party_side, evidence_type, source_type, source_reference, claim, verification_status)
      values (opp, 'seller', 'stated_terms', 'email', comm::text, 'c', 'counterparty_stated');
    raise exception 'NS_TEST_FAILED: duplicate stated-terms evidence';
  exception when unique_violation then null; end; n := n + 1;

  begin
    insert into email_intelligence (communication_id, engine_primary) values (comm, 'nonsense');
    raise exception 'NS_TEST_FAILED: bad engine_primary';
  exception when check_violation then null; end; n := n + 1;

  raise exception 'NS_TESTS_PASSED: %', n;
end
$test$;
