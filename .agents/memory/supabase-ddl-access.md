---
name: Supabase DDL access limitation
description: Some Supabase-backed projects only expose an anon key (no service-role key, no DDL/migration tooling) — creating or altering tables requires the user to run SQL manually.
---

Some projects only provide an anon key for their external Supabase project (no service-role key, no `searchIntegrations` connector for Supabase). In that case the agent cannot run DDL (CREATE TABLE, ALTER TABLE, RLS policy changes) programmatically.

**Why:** the anon key only has whatever access the table's RLS policy grants it, and PostgREST doesn't expose a raw-SQL execution endpoint to the anon role. A table that doesn't exist yet returns PGRST205 "table not found in schema cache" on any REST call — there's no way to create it via the REST API.

**How to apply:** when a task needs a new Supabase table or schema change and only an anon key is available, write the exact `CREATE TABLE`/`ALTER TABLE` SQL and ask the user to run it in the Supabase dashboard's SQL Editor. Give the SQL as plain text, not inside a fenced code block for them to copy — users who paste the whole fenced block (including the code-fence markers) into the SQL Editor get a syntax error. After they confirm, verify by querying the table directly with the anon key before continuing — a 200 response confirms it exists; don't just trust a "done" reply, since users can report success before the query actually ran.

When adding a new `core_*`-style table alongside existing ones that have RLS disabled (open anon CRUD, no per-user scoping), match that same posture unless the new feature specifically needs per-user isolation.
