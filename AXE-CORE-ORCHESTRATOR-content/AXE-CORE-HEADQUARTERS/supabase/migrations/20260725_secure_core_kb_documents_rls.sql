-- Security fix: core_kb_documents had RLS disabled, so the browser anon key
-- could read/write every row. Enable RLS and restrict to authenticated
-- sessions. The service_role (axe_api) bypasses RLS; the browser reads it with
-- a logged-in session, so the Knowledge Base keeps working.
alter table public.core_kb_documents enable row level security;

drop policy if exists auth_core_kb_documents on public.core_kb_documents;
create policy auth_core_kb_documents
  on public.core_kb_documents
  for all
  to authenticated
  using (true)
  with check (true);
