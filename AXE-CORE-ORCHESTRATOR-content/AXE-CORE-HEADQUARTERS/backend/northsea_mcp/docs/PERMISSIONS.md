# Permissions, identity and approvals

The server enforces every rule itself. A client's confirmation dialog protects the
user; it does not protect the business.

## Scopes

| Scope | Grants |
|---|---|
| `northsea.read` | requirements, offers, match assessments, communications analysis |
| `northsea.deal.read` | full operational deal state |
| `northsea.research` | cost-bearing external research |
| `northsea.deal.write` | create/update deal tasks |
| `northsea.communications.draft` | prepare drafts (never sends) |
| `northsea.communications.send` | send a human-approved draft |
| `northsea.identity` | real counterparty names, websites, contacts |
| `northsea.admin` | approve drafts; complete approval-required tasks |

Default OAuth request when a client asks for nothing: `read`, `deal.read`, `research`, `communications.draft`.

## Risk classes and limits (per principal)

| Class | Limits |
|---|---|
| READ_ONLY | 120/min, 2000/h |
| RESEARCH | 4/min, 30/h, 120/day (plus the shared Perplexity daily budget on axe-core-api) |
| DRAFT | 40/h |
| LOW_RISK_WRITE | 60/h |
| HIGH_IMPACT_WRITE | 5/h, 20/day |

## Counterparty identity policy

Without `northsea.identity` a response contains `counterparty_id`, a display-safe
descriptor (role · country · commodity focus · type), verification state and score,
and contact roles with `has_email`/`has_phone` flags. Company and person names,
websites, email addresses and phone numbers are removed from structured fields and
from free text (research findings, subjects, summaries, CrewAI analysis): full name,
name core, distinctive name words, domains, emails and phone numbers are masked.
Sources on the counterparty's own domain are dropped.

Outreach drafts never contain the other party's identity, regardless of scope.

## Approval policy

| Action | Rule |
|---|---|
| Research, analysis, drafting | automatic |
| Save a draft | always `pending` |
| Approve a draft | `northsea.admin`; only `pending`; optimistic concurrency on `updated_at` |
| Approve or send a **sensitive** draft | deal must have `commission_agreement_status = signed` (same rule as `northsea-desk`) |
| Send | draft must be `approved`, `confirm=true`, not already sent; goes through `send-approved-reply` |
| Gates, verification status, stage changes | never changed by this server |
| Prices, payment terms, commission, contracts | never accepted |

Sensitive = identity disclosure, banking details, signatures, SPA, fee/commission
agreements (NCNDA/IMFPA), price/offer acceptance, binding terms — the same term list
`resend-inbound` uses for inbound mail.

## Idempotency

Write tools require `idempotency_key`. The same principal + tool + key with the same
arguments returns the first result without repeating the action; with different
arguments it is refused (`idempotency_conflict`). Independently, identical open tasks
are reused and a sent draft is never sent again (edge function duplicate guard plus
Resend `Idempotency-Key`).
