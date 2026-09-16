-- NorthSea P0-B1 (beslisfuncties): de regels in de database zelf, zodat ELK schrijfpad ze volgt
-- (edge functions, NorthSea MCP, AXE CORE, een toekomstige worker, een handmatige
-- service-role-sessie). Code in de functions controleert hetzelfde vóóraf, zodat
-- er nooit eerst een e-mail de deur uit gaat en daarna pas een trigger weigert.
--
-- Foutcodes in de melding (clients herkennen ze):
--   NS_CONTACT_POLICY      contactbeleid (do_not_contact / synthetic / review_required) blokkeert
--   NS_APPROVAL_INTEGRITY  een goedkeuring zonder echte menselijke herkomst
--   NS_OUTBOUND_PROVENANCE uitgaande e-mail zonder canonieke herkomst
--   NS_SYNTHETIC           testdata die live uitvoering in wil
--   NS_POLICY              deal_automation_policy staat deze automatische handeling niet toe

-- ── Beslisfuncties ──────────────────────────────────────────────────────────
-- Volgorde van ernst: do_not_contact > synthetic > review_required > NULL (toegestaan).
create or replace function public.northsea_pair_block_reason(p_requirement_id uuid, p_offer_id uuid)
returns text language sql stable security definer set search_path = public as $$
  with r as (
    select case c.contact_policy when 'do_not_contact' then 1 when 'review_required' then 3 else 9 end as rang
      from companies c where c.id in (select company_id from buyer_requirements where id = p_requirement_id
                                      union select company_id from supplier_offers where id = p_offer_id)
    union all
    select case when c.is_synthetic then 2 else 9 end
      from companies c where c.id in (select company_id from buyer_requirements where id = p_requirement_id
                                      union select company_id from supplier_offers where id = p_offer_id)
    union all select case when is_synthetic then 2 else 9 end from buyer_requirements where id = p_requirement_id
    union all select case when is_synthetic then 2 else 9 end from supplier_offers where id = p_offer_id
  )
  select case min(rang) when 1 then 'do_not_contact' when 2 then 'synthetic' when 3 then 'review_required' end from r;
$$;

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
    select case when c.is_synthetic then 2 else 9 end
      from companies c where c.id in (select company_id from partij where company_id is not null)
    union all
    select case k.contact_policy when 'do_not_contact' then 1 when 'review_required' then 3 else 9 end
      from contacts k where k.id = p_contact_id or (p_email is not null and lower(btrim(k.email)) = lower(btrim(p_email)))
    union all
    select case when o.is_synthetic then 2 else 9 end from opportunities o where o.id = p_opportunity_id
    union all
    select case northsea_pair_block_reason(o.buyer_requirement_id, o.supplier_offer_id)
             when 'do_not_contact' then 1 when 'synthetic' then 2 when 'review_required' then 3 else 9 end
      from opportunities o where o.id = p_opportunity_id
  )
  select case min(rang) when 1 then 'do_not_contact' when 2 then 'synthetic' when 3 then 'review_required' end from r;
$$;

-- Automatiseringsbeleid in de database: fail-closed. Ontbreekt de rij, of staat een vlag uit,
-- of is de mailbox niet canoniek: niet toegestaan.
create or replace function public.northsea_policy_allows(p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_action
             when 'auto_qualification_reply' then p.auto_send_qualification and p.auto_reply_nonbinding
             when 'system_acknowledgement' then p.auto_reply_nonbinding
             else false end
           and lower(btrim(coalesce(p.operational_mailbox, ''))) = 'trade@northseacommodity.com'
      from deal_automation_policy p where p.id = 1), false);
$$;
revoke all on function public.northsea_policy_allows(text) from public, anon, authenticated;
grant execute on function public.northsea_policy_allows(text) to service_role;

revoke all on function public.northsea_pair_block_reason(uuid, uuid) from public, anon, authenticated;
revoke all on function public.northsea_outbound_block_reason(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.northsea_pair_block_reason(uuid, uuid) to service_role;
grant execute on function public.northsea_outbound_block_reason(uuid, uuid, text, uuid) to service_role;

