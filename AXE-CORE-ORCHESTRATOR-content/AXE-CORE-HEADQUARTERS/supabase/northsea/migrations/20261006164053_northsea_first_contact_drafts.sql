-- Eerste contact heeft nog geen e-maildraad. Geen kunstmatige inbound-rij.
-- Alleen volledige, niet-gevoelige kwalificatie-/documentconcepten mogen zonder anker.
alter table public.reply_drafts alter column communication_id drop not null;
alter table public.reply_drafts add constraint northsea_first_contact_draft_complete check (
  communication_id is not null or (
    company_id is not null and contact_id is not null
    and nullif(btrim(to_email), '') is not null
    and nullif(btrim(subject), '') is not null
    and nullif(btrim(body), '') is not null
    and sensitive_action is false
    and generated_by = 'northsea-mcp'
    and purpose in ('NorthSea MCP outreach: buyer_qualification',
                    'NorthSea MCP outreach: supplier_qualification',
                    'NorthSea MCP outreach: document_request')
  )
);
