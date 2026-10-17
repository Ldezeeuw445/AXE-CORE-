-- Coding seats: één rij per abonnements-CLI op een machine.
--
-- Additief. De Mac mini computer-worker schrijft dit bij elke heartbeat.
-- De app leest via axe-core-api (service_role). Geen tokens, alleen e-mail
-- en de laatste bekende limiettekst.

create table if not exists public.core_coding_seats (
  id text primary key,
  seat_id text not null,
  provider text not null,
  machine text not null,
  host text,
  email text,
  logged_in boolean,
  login_command text not null default '',
  current_task text,
  rate_limited boolean not null default false,
  rate_limit_until timestamptz,
  last_limit_message text,
  remaining_note text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_coding_seats_machine_seat unique (machine, seat_id)
);

create index if not exists idx_core_coding_seats_machine
  on public.core_coding_seats (machine, last_seen_at desc);

alter table public.core_coding_seats enable row level security;

drop policy if exists core_coding_seats_service_role on public.core_coding_seats;
create policy core_coding_seats_service_role on public.core_coding_seats
  for all to service_role
  using (true) with check (true);

revoke all on public.core_coding_seats from anon, authenticated;
grant select, insert, update on table public.core_coding_seats to service_role;

comment on table public.core_coding_seats is
  'Laatst bekende stand van elke codeer-stoel (Claude/Codex/Cursor) per machine. Geen tokens.';
