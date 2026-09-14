# Tools

Names are stable. Every tool returns structured content with a published output
schema. Errors are `code: message` (for example `insufficient_scope`,
`not_found`, `invalid_input`, `rate_limited`, `idempotency_conflict`,
`draft_not_approved`, `commission_protection_required`, `upstream_error`,
`timeout`). Counterparty identities are redacted unless the caller holds
`northsea.identity`.

| Tool | Class | Scopes | Side effects | Approval |
|---|---|---|---|---|
| `northsea_review_deal` | READ_ONLY | deal.read | none | — |
| `northsea_get_next_actions` | READ_ONLY | deal.read | none | — |
| `northsea_qualify_opportunity` | READ_ONLY | deal.read | none (CrewAI analysis if deep) | — |
| `northsea_assess_match` | READ_ONLY | read | none | — |
| `northsea_process_reply` | READ_ONLY | read | none | — |
| `northsea_research_counterparty` | RESEARCH | research | spends research budget | — |
| `northsea_find_suppliers` | RESEARCH | research + read | spends search budget | — |
| `northsea_find_buyers` | RESEARCH | research + read | spends search budget | — |
| `northsea_investigate_blockers` | RESEARCH | research + deal.read | spends research budget | — |
| `northsea_prepare_outreach` | DRAFT | communications.draft | optional: pending draft in Deal Desk | sending always needs approval |
| `northsea_create_task` | LOW_RISK_WRITE | deal.write | inserts `deal_tasks` + `deal_events` | if `requires_approval` |
| `northsea_update_task` | LOW_RISK_WRITE | deal.write | updates `deal_tasks` + `deal_events` | completing approval tasks needs admin |
| `northsea_approve_draft` | HIGH_IMPACT_WRITE | admin | `reply_drafts.approval_status=approved` | is the human approval |
| `northsea_send_approved_communication` | HIGH_IMPACT_WRITE | communications.send | sends via `send-approved-reply` | draft must be approved; `confirm=true` |

All write tools require `idempotency_key` (8–128 chars).

## Inputs and outputs

**northsea_review_deal** `(opportunity_id)` → `DealReview`: code, stage, execution/qualification state, product, buyer/seller `PartyView`, requirement and offer summaries, 9 gates with evidence counts, commercial_fit_score, transaction_readiness_score, commission protection, latest 5 communications (subject/summary redacted), open blockers, evidence, open tasks (deal_tasks + action_queue), deadlines (overdue flagged), top 5 next actions.

**northsea_get_next_actions** `(opportunity_id)` → `NextActions`: actions with rank, title, why, impact, urgency (overdue/now/soon/later), risk, requires_approval, depends_on, owner, source. Ranking: impact×3 + urgency×2 − 1 if approval − dependencies; duplicates removed.

**northsea_qualify_opportunity** `(opportunity_id, depth=standard|deep)` → `QualificationResult`: gates, evidence_state counts, blockers, next actions, task_recommendations (with `create_with`), communication_recommendations (template + reason), crew info.

**northsea_assess_match** `(buyer_requirement_id, supplier_offer_id)` → `MatchAssessmentResult`: commercial_fit_score (commodity-intake rule, threshold 60), transaction_readiness_score (verification, mandate, gates, commission protection), matching_fields, conflicts, unknowns, blockers, recommended_next_actions, existing assessment and opportunity id.

**northsea_process_reply** `(communication_id)` → `ReplyAnalysis`: classification, analysis_source (email_intelligence/call_intelligence/derived), facts explicitly stated (unverified), questions, changed_terms versus the record, blockers, red flags, recommended_reply (existing draft or template), recommended_tasks, requires_human_approval.

**northsea_research_counterparty** `(objective, counterparty_id | context, priority=P2, depth)` → `CounterpartyResearch`: counterparty view, findings (redacted text), claims (database fields and verification checks), sources (counterparty's own domain removed when redacted), verification_state (unchanged), open_questions, blockers, recommended_actions, research run (status/provider/cost), crew info.

**northsea_find_suppliers** `(buyer_requirement_id, geography?, priority)` / **northsea_find_buyers** `(supplier_offer_id, geography?, priority)` → `CandidateSearch`: anchor summary, candidates (database offers/requirements scored with the intake rule; web candidates keyword-scored and capped at 80), dedupe summary (found, duplicates removed, already in database, new), verification gaps, `persisted=false`.

**northsea_investigate_blockers** `(opportunity_id, blocker_codes?, priority, depth)` → `BlockerInvestigation`: investigated codes, resolved (only codes not open), unresolved with reason, new_evidence (unverified claims with cited sources), recommended actions. Research never clears a blocker.

**northsea_prepare_outreach** `(objective, opportunity_id | counterparty_id, channel, template=auto|supplier_qualification|buyer_qualification|follow_up|document_request, save_as_pending_draft=false, idempotency_key?)` → `OutreachDraft`: subject, body (never names the other party; non-binding footer), facts_used, unknowns, sensitive, approval_required=true, sent=false, saved_draft_id/saved_status, notes. Saving needs an existing inbound email from that counterparty (Deal Desk drafts are replies).

**northsea_create_task** `(opportunity_id, title, idempotency_key, description?, task_type=follow_up, priority=50, due_at?, requires_approval=false, owner=axe|luka)` → `TaskResult` (identical open task is reused).

**northsea_update_task** `(task_id, idempotency_key, status?, result_note?, due_at?, priority?, expected_updated_at?)` → `TaskResult`. Statuses: open, waiting, in_progress, completed, cancelled.

**northsea_approve_draft** `(draft_id, idempotency_key, expected_updated_at?)` → `DraftApprovalResult`.

**northsea_send_approved_communication** `(draft_id, confirm, idempotency_key)` → `SendResult` (submitted, duplicate, communication_id, provider_message_id). A sent draft is never sent again.

## Resources

- `northsea://policy/permissions` — scopes, risk classes, idempotency and CrewAI flags per tool, policy rules.
- `northsea://policy/statuses` — deal stages, verification states, gates, draft and task statuses.
