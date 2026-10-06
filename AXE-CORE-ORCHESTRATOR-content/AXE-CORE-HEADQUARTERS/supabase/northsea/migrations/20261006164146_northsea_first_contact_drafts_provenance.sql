alter table public.reply_drafts add constraint northsea_first_contact_draft_provenance check (communication_id is not null or (generated_by is not null and purpose is not null));
