-- NorthSea P2: factual reconciliation of Resend-sent messages that were
-- successfully sent by the provider but never journalled in communications.
--
-- "provider_reconciled" is deliberately NOT an approval. It records a historical
-- provider fact after the send has already happened. The communications trigger
-- still requires canonical NorthSea sender/reply-to, Resend transport, provider
-- message id, actor and actor_type. It also keeps provenance immutable.
--
-- No automation policy is enabled by this migration and nothing is sent.

alter table public.communications
  drop constraint if exists communications_approval_basis_check;

alter table public.communications
  add constraint communications_approval_basis_check
  check (
    approval_basis is null
    or approval_basis = any (array[
      'human_approved_draft'::text,
      'policy_allowed'::text,
      'system_acknowledgement'::text,
      'provider_reconciled'::text
    ])
  );

comment on column public.communications.approval_basis is
  'Why an outbound communication exists in the canonical journal. provider_reconciled is historical provider evidence, not approval to send.';
