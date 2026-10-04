-- Meldingen die je slotscherm halen.
--
-- ## Waarom een eigen tabel en niet `push_subscriptions`
--
-- Op dit Supabase-project staat al een `public.push_subscriptions` met 8 rijen.
-- Die komt in deze repo nergens voor: hij is van AXE Companion, dat hetzelfde
-- project deelt. In andermans tabel schrijven is precies de fout die hier eerder
-- maanden kostte -- zie de kop van `src/infrastructure/persistence/chatPersistence.ts`
-- over `public.messages`, waar AXE Core's berichten tegen constraints liepen die
-- voor een ander product geschreven waren, en elke insert stil verloren ging.
--
-- Dus een eigen tabel in de `core_*`-naamruimte, net als core_tasks,
-- core_notifications en core_memory.
--
-- ## Waarom het endpoint de sleutel is
--
-- De pushdienst geeft per installatie een uniek endpoint. Een browser mag dat
-- abonnement vernieuwen en geeft dan een NIEUW endpoint voor hetzelfde toestel.
-- Op endpoint uniek zijn houdt dat vanzelf netjes; `apparaat` staat erbij zodat
-- je in de tabel kunt zien welke rij bij welk toestel hoort.

create table if not exists public.core_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  -- Het apparaat-id uit apparaatId() in chatPersistence.ts, zodat een rij te
  -- herkennen is zonder de endpoint-URL te moeten lezen.
  apparaat    text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  -- Gezet als de pushdienst zei dat dit abonnement weg is. De zender ruimt die
  -- rijen op; dit veld is er zodat een mislukking zichtbaar is in plaats van
  -- alleen in een log te staan.
  failed_at   timestamptz
);

create index if not exists core_push_subscriptions_user_idx
  on public.core_push_subscriptions (user_id);

alter table public.core_push_subscriptions enable row level security;

-- Je eigen apparaten, en niets anders. De zender draait met de service role en
-- gaat hier langs RLS heen -- dat is de bedoeling: die moet iedereen bereiken
-- die zich heeft aangemeld.
drop policy if exists core_push_subscriptions_eigen on public.core_push_subscriptions;
create policy core_push_subscriptions_eigen
  on public.core_push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- De markering "deze melding is verstuurd".
--
-- Een watermerk in core_system_state zou simpeler lijken, maar slaat rijen over
-- of stuurt dubbel zodra er iets niet op volgorde binnenkomt. Deze kolom is
-- additief: de app selecteert zijn kolommen expliciet (SELECT_COLUMNS in
-- NotificationContext.tsx), dus voor bestaande lezers verandert er niets.
alter table public.core_notifications
  add column if not exists pushed_at timestamptz;

-- Alleen de rijen die de zender elke minuut zoekt. Zonder dit scant hij 449
-- rijen (en groeiend) per tik.
create index if not exists core_notifications_ongepusht_idx
  on public.core_notifications (created_at)
  where pushed_at is null;
