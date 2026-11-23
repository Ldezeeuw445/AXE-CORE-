-- Verbruik per sleutel (Luka 23 nov: "keys per app met verbruik dat AXE zelf kan lezen").
-- Alleen de NAAM van de env-variabele, nooit een waarde. Additief: nieuwe tabel + functie.
create table if not exists public.core_key_usage (
  dag date not null,
  sleutel text not null,
  calls integer not null default 0,
  ok integer not null default 0,
  mislukt integer not null default 0,
  limiet integer not null default 0,
  tokens bigint not null default 0,
  laatste_status integer,
  laatste_at timestamptz,
  primary key (dag, sleutel)
);
alter table public.core_key_usage enable row level security;
-- Alleen de server (service_role) leest en schrijft; de app leest via /keys/overview.
grant select, insert, update on table public.core_key_usage to service_role;

create or replace function public.axe_tel_sleutel(
  p_dag date, p_sleutel text, p_calls integer, p_ok integer, p_mislukt integer,
  p_limiet integer, p_tokens bigint, p_status integer
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.core_key_usage as u (dag, sleutel, calls, ok, mislukt, limiet, tokens, laatste_status, laatste_at)
  values (p_dag, p_sleutel, p_calls, p_ok, p_mislukt, p_limiet, p_tokens, p_status, now())
  on conflict (dag, sleutel) do update set
    calls = u.calls + excluded.calls,
    ok = u.ok + excluded.ok,
    mislukt = u.mislukt + excluded.mislukt,
    limiet = u.limiet + excluded.limiet,
    tokens = u.tokens + excluded.tokens,
    laatste_status = coalesce(excluded.laatste_status, u.laatste_status),
    laatste_at = now();
$$;
revoke all on function public.axe_tel_sleutel(date, text, integer, integer, integer, integer, bigint, integer) from public, anon, authenticated;
