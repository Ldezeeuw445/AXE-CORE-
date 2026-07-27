-- Real notifications backing store. RightPanel.tsx already queries this exact
-- table/columns (core_notifications: id, type, message, created_at) — it never
-- existed, so that query silently returned nothing. NotificationContext.tsx
-- (the bell icon) was separately pure in-memory with a dead addNotification
-- that nothing called. This table is the single real source for both.

create table if not exists public.core_notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'info'
              check (type in ('info', 'success', 'warning', 'error')),
  title       text not null default '',
  message     text not null,
  source      text not null default 'system',   -- 'schedule' | 'agent' | 'system'
  link        text,                              -- optional deep-link, e.g. /tasks?open=<id>
  read        boolean not null default false,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_core_notifications_created_at
  on public.core_notifications (created_at desc);
create index if not exists idx_core_notifications_unread
  on public.core_notifications (read, created_at desc);

alter table public.core_notifications enable row level security;

-- Single-user app: same open policy pattern as core_tasks/core_schedules.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'core_notifications' and policyname = 'svc_core_notifications'
  ) then
    create policy svc_core_notifications on public.core_notifications using (true) with check (true);
  end if;
end $$;

-- Required for NotificationContext's realtime subscription to actually fire —
-- a table isn't live-streamed just because RLS allows reading it; it has to
-- be added to the publication Supabase Realtime watches.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'core_notifications'
  ) then
    alter publication supabase_realtime add table public.core_notifications;
  end if;
end $$;
