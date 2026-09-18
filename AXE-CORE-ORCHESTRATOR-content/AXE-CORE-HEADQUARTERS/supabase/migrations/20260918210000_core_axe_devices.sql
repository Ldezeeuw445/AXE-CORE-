-- AXE-installaties: aanwezigheid van desktop- en mobiele clients.
-- Geen tweede orchestrator. core_tasks en core_computer_workers blijven
-- wat ze zijn; deze tabel is alleen inventory/presence/capability.
--
-- Online wordt NIET opgeslagen. De app leidt het af van last_seen.

create table if not exists public.core_axe_devices (
  device_id     text primary key,
  device_name   text not null,
  device_type   text not null check (device_type in ('desktop', 'mobile', 'server')),
  platform      text not null,
  app_version   text,
  capabilities  jsonb not null default '[]'::jsonb,
  last_seen     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_core_axe_devices_seen
  on public.core_axe_devices (last_seen desc);

alter table public.core_axe_devices enable row level security;

drop policy if exists luka_all_core_axe_devices on public.core_axe_devices;
create policy luka_all_core_axe_devices on public.core_axe_devices
  for all to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid)
  with check ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);
