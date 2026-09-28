-- NorthSea P1b — bevindingen uit de productie-dry-run van 16 september 2026.
--
--  1. Twee echte bounces (Thai Rice and Food, Siki Rice) staan alleen in communications.provider_metadata;
--     er is geen contactrecord met dat adres. De P1a-guard keek alleen naar contacts.email_status en liet
--     een nieuw concept naar zo'n adres dus toe. Nu blokkeert ook de vastgelegde provider-bounce.
--  2. Luka's P1-beslissing (16 sep): dbe1c54c Thai Rice and Food blijft review_required en het bounced adres
--     wordt nooit automatisch opnieuw geprobeerd. P0 had alleen b6c0e69a gezet; deze stond nog op 'allowed'.
--
-- Idempotent. Verandert geen historie: geen bericht, concept of bezorgstatus wordt herschreven.

create or replace function public.northsea_outbound_block_reason(p_company_id uuid, p_contact_id uuid, p_email text, p_opportunity_id uuid)
returns text language sql stable security definer set search_path = public as $$
  with partij as (
    select p_company_id as company_id
    union select company_id from contacts where id = p_contact_id
    union select company_id from contacts where p_email is not null and lower(btrim(email)) = lower(btrim(p_email))
  ), r as (
    select case c.contact_policy when 'do_not_contact' then 1 when 'review_required' then 3 else 9 end as rang
      from companies c where c.id in (select company_id from partij where company_id is not null)
    union all
    select case when c.is_synthetic then 1.5 else 9 end
      from companies c where c.id in (select company_id from partij where company_id is not null)
    union all
    select case k.contact_policy when 'do_not_contact' then 1 when 'review_required' then 3 else 9 end
      from contacts k where k.id = p_contact_id or (p_email is not null and lower(btrim(k.email)) = lower(btrim(p_email)))
    union all
    -- P1: een adres dat bounced is wordt nooit automatisch opnieuw geprobeerd (alleen bij een bekend adres).
    select case when k.email_status in ('bounced', 'complained') then 2 else 9 end
      from contacts k where p_email is not null and lower(btrim(k.email)) = lower(btrim(p_email))
    union all
    -- P1b: een bounce die alleen in provider_metadata staat (adres zonder contactrecord) blokkeert ook.
    -- Alleen een contact met precies dit adres dat NA die bounce als 'valid' is herbevestigd heft het op.
    select 2 from communications cm
      cross join lateral (
        select jsonb_array_elements_text(case jsonb_typeof(cm.provider_metadata -> 'to')
                 when 'array' then cm.provider_metadata -> 'to' when 'string' then jsonb_build_array(cm.provider_metadata -> 'to') else '[]'::jsonb end) as x
        union all
        select jsonb_array_elements_text(case jsonb_typeof(cm.provider_metadata -> 'last_event' -> 'to')
                 when 'array' then cm.provider_metadata -> 'last_event' -> 'to' when 'string' then jsonb_build_array(cm.provider_metadata -> 'last_event' -> 'to') else '[]'::jsonb end)
      ) a
     where p_email is not null
       and cm.direction = 'outbound' and cm.delivery_status in ('bounced', 'complained')
       and lower(btrim(coalesce(substring(a.x from '<([^>]+)>'), a.x))) = lower(btrim(p_email))
       and not exists (select 1 from contacts k where lower(btrim(k.email)) = lower(btrim(p_email)) and k.email_status = 'valid'
                         and k.email_status_at >= coalesce(cm.delivery_status_at, cm.occurred_at))
    union all
    select case when o.is_synthetic then 1.5 else 9 end from opportunities o where o.id = p_opportunity_id
    union all
    select case northsea_pair_block_reason(o.buyer_requirement_id, o.supplier_offer_id)
             when 'do_not_contact' then 1 when 'synthetic' then 1.5 when 'review_required' then 3 else 9 end
      from opportunities o where o.id = p_opportunity_id
  )
  select case min(rang) when 1 then 'do_not_contact' when 1.5 then 'synthetic' when 2 then 'bounced_channel' when 3 then 'review_required' end from r;
$$;

update public.companies
   set contact_policy = 'review_required',
       contact_policy_reason = 'Luka decision 2026-09-16 (P1 instruction): keep review_required; the bounced address info@thairiceandfood.com is unusable and must never be retried automatically. A newly independently verified channel may be reviewed later.',
       contact_policy_set_at = now(),
       contact_policy_set_by = 'luka (P1 instruction, applied by p1b migration)'
 where id = 'dbe1c54c-f2ed-4329-b5ec-647d3d9c5ae6' and contact_policy = 'allowed';

insert into public.northsea_audit_events (actor_type, actor, action, company_id, details)
select 'human', 'luka', 'contact_policy_set', 'dbe1c54c-f2ed-4329-b5ec-647d3d9c5ae6',
       jsonb_build_object('contact_policy', 'review_required', 'source', 'P1 instruction 2026-09-16', 'applied_by', 'p1b migration',
                          'bounced_address', 'info@thairiceandfood.com', 'bounce_communication_id', 'ff3783cf-774b-4c63-aa6b-7aed73294387')
 where exists (select 1 from public.companies where id = 'dbe1c54c-f2ed-4329-b5ec-647d3d9c5ae6')
   and not exists (select 1 from public.northsea_audit_events where company_id = 'dbe1c54c-f2ed-4329-b5ec-647d3d9c5ae6' and action = 'contact_policy_set');
