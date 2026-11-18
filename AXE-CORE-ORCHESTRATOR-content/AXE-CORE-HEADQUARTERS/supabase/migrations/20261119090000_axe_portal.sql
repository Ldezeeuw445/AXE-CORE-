-- Portal (Luka, 18 nov 2026): gooi een foto, video, bestand of je klembord
-- van de iPhone naar een Mac. Eén rij per worp; het bestand zelf staat in de
-- privé-bucket axe-portal. Alleen Luka's account mag erbij (zelfde regel als
-- core_axe_devices en axe-camera).

create table if not exists public.core_portal (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  van text not null default '',
  -- device_id van de Mac, of 'alle'
  naar text not null default 'alle',
  soort text not null check (soort in ('bestand', 'tekst')),
  naam text not null default '',
  mime text not null default '',
  grootte bigint not null default 0,
  pad text,
  tekst text,
  opgehaald_door text,
  opgehaald_at timestamptz
);

create index if not exists core_portal_open on public.core_portal (created_at desc) where opgehaald_at is null;

alter table public.core_portal enable row level security;

-- Expliciet: de telefoon en de Macs (ingelogd als Luka) lezen en schrijven,
-- de VPS (service_role) mag opruimen. Anon niets.
revoke all on table public.core_portal from anon;
grant select, insert, update on table public.core_portal to authenticated;
grant select, insert, update, delete on table public.core_portal to service_role;

drop policy if exists luka_all_core_portal on public.core_portal;
create policy luka_all_core_portal on public.core_portal for all to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid)
  with check ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);

insert into storage.buckets (id, name, public, file_size_limit)
values ('axe-portal', 'axe-portal', false, 52428800)
on conflict (id) do nothing;

drop policy if exists axe_portal_luka_lezen on storage.objects;
create policy axe_portal_luka_lezen on storage.objects for select to authenticated
  using (bucket_id = 'axe-portal' and (select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);
drop policy if exists axe_portal_luka_schrijven on storage.objects;
create policy axe_portal_luka_schrijven on storage.objects for insert to authenticated
  with check (bucket_id = 'axe-portal' and (select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);
drop policy if exists axe_portal_luka_opruimen on storage.objects;
create policy axe_portal_luka_opruimen on storage.objects for delete to authenticated
  using (bucket_id = 'axe-portal' and (select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);
