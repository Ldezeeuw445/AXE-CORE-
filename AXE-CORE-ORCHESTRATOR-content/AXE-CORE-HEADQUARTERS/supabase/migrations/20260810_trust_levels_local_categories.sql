-- The category CHECK predates smart_home and the local-bridge tools, so rows
-- for them were rejected and their switches silently did nothing.
alter table public.core_trust_levels
  drop constraint if exists core_trust_levels_category_check;

alter table public.core_trust_levels
  add constraint core_trust_levels_category_check
  check (category = any (array[
    'exec','git_write','git_pr_merge','db_sql','vercel_promote','agent',
    'smart_home','local_write','local_run'
  ]));

-- Seeded off: these reach the worktree the running app is served from, so
-- they should be a deliberate opt-in rather than on by default.
insert into public.core_trust_levels (category, auto_approve)
values ('smart_home', false), ('local_write', false), ('local_run', false)
on conflict (category) do nothing;
