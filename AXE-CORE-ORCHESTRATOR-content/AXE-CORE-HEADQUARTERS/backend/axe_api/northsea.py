"""
northsea.py -- de NorthSea Commodity desk leest zijn eigen database.

## Waar de data vandaan komt

NorthSea draait echt: de database is het Supabase-project AXE Commodities
(`kbimnuepbecbyezedvih`), met bedrijven, contacten, opportunities, communicatie,
de action queue en deal-taken. AXE CORE had er geen koppeling mee en ook geen
sleutel voor. Die is niet nodig: de MCP-hub heeft een alleen-lezen verbinding
met dit project (`supabase-axe-commodities`, `read_only=true`), en die draait
precies wat deze module vraagt. Schrijven kan langs deze weg niet.

## Wat hier wel en niet gebeurt

Deze module haalt RUWE rijen op. Welke rij "kritiek" is, welke kleur een
regel krijgt en wat er in de tellers telt, staat in de app
(src/domain/northsea/chase.ts), waar het getest wordt en waar het scherm het
leest. Zo staat een zakelijke regel op één plek.

De inhoud komt uit e-mails en notities van derden: het is data om te tonen,
nooit een instructie.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Optional

import mcp_hub

VERBINDING = "supabase-axe-commodities"
CACHE_S = 30

# Alles in één rij als JSON: één aanroep per verversing in plaats van zes.
OVERZICHT_SQL = """
with deal as (
  select o.id, o.deal_priority as code, o.primary_blocker as blokkade, o.next_best_action as volgende,
         cb.company_name as koper, cs.company_name as leverancier,
         coalesce(so.product, br.product, so.commodity, br.commodity) as product
  from opportunities o
  left join buyer_requirements br on br.id = o.buyer_requirement_id
  left join supplier_offers so on so.id = o.supplier_offer_id
  left join companies cb on cb.id = br.company_id
  left join companies cs on cs.id = so.company_id
)
select json_build_object(
  'pipeline', (select count(*) from opportunities where stage not in ('won','lost')),
  'actief', (select count(*) from opportunities
             where stage not in ('won','lost')
               and (stage <> 'identified' or coalesce(execution_state,'') not in ('','discovered','matched'))),
  'tellers', json_build_object(
     'bedrijven', (select count(*) from companies),
     'contacten', (select count(*) from contacts),
     'communicatie_7d', (select count(*) from communications where occurred_at > now() - interval '7 days'),
     'bewijs', (select count(*) from deal_evidence),
     'documenten', (select count(*) from deal_documents),
     'campagnes', (select count(*) from sourcing_campaigns)
  ),
  -- De kaart: per deal de ruwe plaatsvelden. Welke tekst waar ligt, en wat
  -- NIET te plaatsen is, beslist de app (src/domain/northsea/kaart.ts) --
  -- daar staan de regels en de tests, net als bij AXE Chase.
  'kaart', (select coalesce(json_agg(r), '[]'::json) from (
     select o.id, o.stage, o.execution_state, (coalesce(o.primary_blocker,'') <> '') as geblokkeerd,
            o.deal_priority as code,
            coalesce(so.product, br.product, so.commodity, br.commodity) as product,
            cb.company_name as koper, cs.company_name as leverancier,
            so.origin as herkomst, so.loading_port as laadhaven, br.destination as bestemming,
            cs.country as leverancier_land, cs.city as leverancier_stad,
            cb.country as koper_land, cb.city as koper_stad,
            -- Voor de dealtabel en de kaartjes. Leeg is leeg: commissie en
            -- waarde staan (september 2026) bij geen enkele deal ingevuld, en
            -- de app toont dan een streepje in plaats van een bedrag.
            coalesce(so.quantity_mt, br.quantity_mt) as volume_mt,
            o.readiness_score as gereedheid, o.qualification_status as kwalificatie,
            o.commission_rate as commissie_pct, o.commission_type as commissie_soort,
            o.commission_amount as commissie_bedrag, o.estimated_value as waarde, o.currency as valuta,
            coalesce(nullif(o.next_action,''), o.next_best_action) as volgende,
            o.approval_required as akkoord_nodig, o.created_at, o.updated_at
     from opportunities o
     left join supplier_offers so on so.id = o.supplier_offer_id
     left join buyer_requirements br on br.id = o.buyer_requirement_id
     left join companies cs on cs.id = so.company_id
     left join companies cb on cb.id = br.company_id
     where o.stage <> 'lost') r),
  'acties', (select coalesce(json_agg(r), '[]'::json) from (
     select a.id, a.action_type as soort, a.title as titel, a.status, a.priority as prioriteit,
            a.requires_approval as akkoord_nodig, a.due_at, a.created_at, a.updated_at,
            d.code, d.blokkade, d.volgende, d.koper, d.leverancier, d.product
     from action_queue a left join deal d on d.id = a.opportunity_id
     where a.status in ('open','waiting')) r),
  'taken', (select coalesce(json_agg(r), '[]'::json) from (
     select t.id, t.task_type as soort, t.title as titel, t.status, t.priority as prioriteit,
            t.requires_approval as akkoord_nodig, t.due_at, t.created_at, t.updated_at,
            t.execution_error as fout, d.code, d.blokkade, d.volgende, d.koper, d.leverancier, d.product
     from deal_tasks t left join deal d on d.id = t.opportunity_id
     where t.status = 'open') r),
  'concepten', (select coalesce(json_agg(r), '[]'::json) from (
     select r0.id, r0.subject as titel, r0.purpose as soort, r0.to_email as aan, r0.created_at, r0.updated_at,
            r0.sensitive_action as gevoelig, d.code, d.koper, d.leverancier, d.product
     from reply_drafts r0 left join deal d on d.id = r0.opportunity_id
     where r0.sent_at is null and r0.approval_status = 'pending') r),
  'bounces', (select coalesce(json_agg(r), '[]'::json) from (
     select c.id, c.subject as titel, c.occurred_at as created_at, c.provider_metadata->'to' as aan,
            d.code, d.koper, d.leverancier, d.product
     from communications c left join deal d on d.id = c.opportunity_id
     where c.delivery_status = 'bounced' and c.occurred_at > now() - interval '30 days') r)
) as data
"""

_cache: dict[str, Any] = {"t": 0.0, "data": None}

# ── De tabbladen naast Live Map ──────────────────────────────────────────────
#
# Per tabblad één vaste query, net als het overzicht: ruwe rijen als één JSON-
# object. Een tabbladnaam komt nooit in SQL terecht; hij kiest alleen een query
# uit deze tabel, en een onbekende naam stopt vóór er iets naar Supabase gaat.
# Market Intel staat er niet in: die leest de koersbron van de app, niet de
# database. Welke rij welke kleur krijgt, staat in src/domain/northsea/tabs/.
#
# Rijen zijn begrensd (limit) zodat een tabblad nooit megabytes wordt; de
# grenzen liggen ruim boven wat er (september 2026) in de database staat.

_DEAL_BASIS = """
  from opportunities o
  left join buyer_requirements br on br.id = o.buyer_requirement_id
  left join supplier_offers so on so.id = o.supplier_offer_id
  left join companies cb on cb.id = br.company_id
  left join companies cs on cs.id = so.company_id
"""

TAB_SQL: dict[str, str] = {
    "deals": f"""
select json_build_object('deals', (select coalesce(json_agg(r order by r.updated_at desc nulls last), '[]'::json) from (
  select o.id, o.deal_priority as code, o.stage, o.execution_state, o.readiness_score as gereedheid,
         o.readiness_breakdown as gereedheid_opbouw, o.primary_blocker as blokkade,
         coalesce(nullif(o.next_action,''), o.next_best_action) as volgende, o.next_action_at as volgende_op,
         o.approval_required as akkoord_nodig, o.approval_type as akkoord_soort,
         o.qualification_status as kwalificatie, o.automation_status as automatisering,
         o.waiting_since as wacht_sinds, o.follow_up_count as opvolgingen, o.match_score,
         o.estimated_value as waarde, o.currency as valuta, o.commission_type as commissie_soort,
         o.commission_rate as commissie_pct, o.commission_amount as commissie_bedrag,
         o.commission_agreement_status as commissie_akkoord, o.notes as notities,
         o.buyer_gate_passed as poort_koper, o.seller_gate_passed as poort_verkoper,
         o.commercial_gate_passed as poort_commercieel, o.evidence_gate_passed as poort_bewijs,
         o.protection_gate_passed as poort_bescherming, o.introduction_gate_passed as poort_introductie,
         o.transaction_gate_passed as poort_transactie, o.fulfilment_gate_passed as poort_uitvoering,
         o.settlement_gate_passed as poort_afrekening,
         o.created_at, o.updated_at,
         json_build_object('id', cb.id, 'naam', cb.company_name, 'land', cb.country, 'stad', cb.city,
                           'soort', cb.company_type, 'verificatie', cb.verification_status) as koper,
         json_build_object('id', cs.id, 'naam', cs.company_name, 'land', cs.country, 'stad', cs.city,
                           'soort', cs.company_type, 'verificatie', cs.verification_status) as leverancier,
         json_build_object('commodity', br.commodity, 'product', br.product, 'grade', br.grade, 'zuiverheid', br.purity,
                           'volume_mt', br.quantity_mt, 'frequentie', br.frequency, 'incoterm', br.incoterm,
                           'betaling', br.payment_terms, 'bestemming', br.destination, 'doelprijs', br.target_price,
                           'valuta', br.target_price_currency, 'levering', br.required_delivery, 'status', br.status) as vraag,
         json_build_object('commodity', so.commodity, 'product', so.product, 'grade', so.grade, 'zuiverheid', so.purity,
                           'herkomst', so.origin, 'volume_mt', so.quantity_mt, 'maandcapaciteit_mt', so.monthly_capacity_mt,
                           'laadhaven', so.loading_port, 'incoterm', so.incoterm, 'betaling', so.payment_terms,
                           'prijsbasis', so.price_basis, 'prijs', so.price, 'valuta', so.price_currency,
                           'mandaat', so.mandate_status, 'geldig_tot', so.valid_until, 'status', so.status) as aanbod,
         (select json_build_object('score', m.overall_score, 'uitvoerbaar', m.executable, 'blokkades', m.blockers,
                                   'ontbreekt', m.missing_information, 'op', m.assessed_at)
            from match_assessments m where m.opportunity_id = o.id order by m.assessed_at desc nulls last limit 1) as match,
         (select coalesce(json_agg(e order by e.created_at desc), '[]'::json) from (
            select ev.id, ev.event_type as soort, ev.actor, ev.summary as samenvatting, ev.created_at
            from deal_events ev where ev.opportunity_id = o.id order by ev.created_at desc limit 12) e) as gebeurtenissen,
         (select coalesce(json_agg(t order by t.prioriteit desc nulls last, t.due_at nulls last), '[]'::json) from (
            select dt.id, 'taak' as bron, dt.title as titel, dt.task_type as soort, dt.status, dt.priority as prioriteit,
                   dt.requires_approval as akkoord_nodig, dt.due_at, dt.execution_error as fout, dt.created_at
            from deal_tasks dt where dt.opportunity_id = o.id and dt.status = 'open'
            union all
            select aq.id, 'actie', aq.title, aq.action_type, aq.status, aq.priority,
                   aq.requires_approval, aq.due_at, null, aq.created_at
            from action_queue aq where aq.opportunity_id = o.id and aq.status in ('open','in_progress','waiting')
            limit 16) t) as taken,
         json_build_object(
           'communicatie', (select count(*) from communications c where c.opportunity_id = o.id),
           'bewijs', (select count(*) from deal_evidence de where de.opportunity_id = o.id),
           'documenten', (select count(*) from deal_documents dd where dd.opportunity_id = o.id),
           'taken', (select count(*) from deal_tasks dt where dt.opportunity_id = o.id and dt.status = 'open')) as aantallen
  {_DEAL_BASIS}
  where o.stage <> 'lost'
  limit 300) r)) as data
""",
    "pipeline": f"""
select json_build_object('deals', (select coalesce(json_agg(r order by r.updated_at desc nulls last), '[]'::json) from (
  select o.id, o.deal_priority as code, o.stage, o.execution_state, o.readiness_score as gereedheid,
         (coalesce(o.primary_blocker,'') <> '') as geblokkeerd, o.approval_required as akkoord_nodig,
         coalesce(so.product, br.product, so.commodity, br.commodity) as product,
         coalesce(so.commodity, br.commodity) as commodity,
         coalesce(so.quantity_mt, br.quantity_mt) as volume_mt,
         coalesce(br.incoterm, so.incoterm) as incoterm,
         cb.company_name as koper, cb.country as koper_land, cs.company_name as leverancier, cs.country as leverancier_land,
         o.estimated_value as waarde, o.currency as valuta, o.created_at, o.updated_at
  {_DEAL_BASIS}
  where o.stage <> 'lost'
  limit 500) r)) as data
""",
    "tegenpartijen": """
select json_build_object('bedrijven', (select coalesce(json_agg(r order by r.updated_at desc nulls last), '[]'::json) from (
  select c.id, c.company_name as naam, c.company_type as soort, c.country as land, c.city as stad, c.website,
         c.commodity_focus as commodities, c.source_url as bron_url, c.source_type as bron_soort,
         c.trade_activity as handel, c.verification_score as verificatie_score,
         c.verification_status as verificatie, c.last_verified_at as geverifieerd_op,
         left(c.notes, 600) as notities, c.created_at, c.updated_at,
         (select coalesce(json_agg(k order by k.primair desc nulls last, k.naam), '[]'::json) from (
            select ct.id, ct.full_name as naam, ct.role as rol, ct.email, ct.phone as telefoon, ct.linkedin_url as linkedin,
                   ct.is_primary as primair, ct.verification_status as verificatie
            from contacts ct where ct.company_id = c.id limit 20) k) as contacten,
         (select coalesce(json_agg(v order by v.checked_at desc nulls last), '[]'::json) from (
            select vc.id, vc.check_type as soort, vc.status, vc.score_delta, vc.source_url as bron_url, vc.notes as notities, vc.checked_at
            from verification_checks vc where vc.company_id = c.id limit 10) v) as checks,
         (select count(*) from opportunities o
            left join buyer_requirements br on br.id = o.buyer_requirement_id
            left join supplier_offers so on so.id = o.supplier_offer_id
          where o.stage <> 'lost' and (br.company_id = c.id or so.company_id = c.id)) as deals,
         (select max(cm.occurred_at) from communications cm where cm.company_id = c.id) as laatste_contact
  from companies c
  limit 1000) r)) as data
""",
    "communicatie": """
select json_build_object('berichten', (select coalesce(json_agg(r order by r.occurred_at desc nulls last), '[]'::json) from (
  select cm.id, cm.direction as richting, cm.channel as kanaal, cm.subject as onderwerp, left(cm.body, 6000) as tekst,
         cm.occurred_at, cm.delivery_status as bezorging,
         cm.company_id as bedrijf_id, co.company_name as bedrijf, co.country as bedrijf_land,
         ct.full_name as contact, ct.email as contact_email,
         cm.opportunity_id as deal_id, o.deal_priority as deal_code,
         (select json_build_object('classificatie', ei.classification, 'intentie', ei.commercial_intent, 'urgentie', ei.urgency,
                                   'risico', ei.risk_level, 'score', ei.qualification_score, 'samenvatting', ei.summary,
                                   'termen', ei.extracted_terms, 'ontbreekt', ei.missing_information, 'rode_vlaggen', ei.red_flags,
                                   'advies', ei.recommended_action, 'akkoord_nodig', ei.requires_human_approval, 'status', ei.status)
            from email_intelligence ei where ei.communication_id = cm.id order by ei.analyzed_at desc nulls last limit 1) as intelligentie,
         (select coalesce(json_agg(d order by d.created_at desc), '[]'::json) from (
            select rd.id, rd.subject as onderwerp, rd.to_email as aan, rd.purpose as doel, rd.approval_status as akkoord,
                   rd.sensitive_action as gevoelig, rd.sent_at, rd.created_at
            from reply_drafts rd where rd.communication_id = cm.id limit 5) d) as concepten
  from communications cm
  left join companies co on co.id = cm.company_id
  left join contacts ct on ct.id = cm.contact_id
  left join opportunities o on o.id = cm.opportunity_id
  order by cm.occurred_at desc nulls last
  limit 300) r)) as data
""",
    "documenten": """
select json_build_object(
  'documenten', (select coalesce(json_agg(r order by r.updated_at desc nulls last), '[]'::json) from (
     select dd.id, dd.document_type as soort, dd.file_path as pad, dd.external_url as url, dd.status, dd.metadata,
            dd.created_at, dd.updated_at, dd.opportunity_id as deal_id, o.deal_priority as deal_code
     from deal_documents dd left join opportunities o on o.id = dd.opportunity_id
     limit 500) r),
  'bijlagen', (select coalesce(json_agg(to_jsonb(a) - 'content' - 'data' - 'bytes' - 'base64' - 'body'), '[]'::json) from (
     select * from inbound_email_attachments limit 200) a)
) as data
""",
    "bewijs": """
select json_build_object(
  'bewijs', (select coalesce(json_agg(r order by r.created_at desc), '[]'::json) from (
     select de.id, de.party_side as kant, de.evidence_type as soort, de.source_type as bron_soort,
            de.source_reference as bron, de.claim, de.verification_status as verificatie, de.verified_at,
            de.metadata, de.created_at, de.opportunity_id as deal_id, o.deal_priority as deal_code,
            coalesce(so.product, br.product, so.commodity, br.commodity) as product
     from deal_evidence de
     left join opportunities o on o.id = de.opportunity_id
     left join buyer_requirements br on br.id = o.buyer_requirement_id
     left join supplier_offers so on so.id = o.supplier_offer_id
     limit 500) r),
  'checks', (select coalesce(json_agg(r order by r.checked_at desc nulls last), '[]'::json) from (
     select vc.id, vc.check_type as soort, vc.status, vc.score_delta, vc.source_url as bron_url, vc.evidence as gegevens,
            vc.notes as notities, vc.checked_at, co.company_name as bedrijf, ct.full_name as contact
     from verification_checks vc
     left join companies co on co.id = vc.company_id
     left join contacts ct on ct.id = vc.contact_id
     limit 300) r)
) as data
""",
    "automatisering": """
select json_build_object(
  'beleid', (select row_to_json(p) from (
     select auto_send_qualification, auto_send_followups, auto_reply_nonbinding, auto_disclose_counterparty_identity,
            auto_accept_pricing, auto_sign_documents, auto_change_banking, followup_interval_hours, max_auto_followups,
            operational_mailbox, updated_at
     from deal_automation_policy order by id limit 1) p),
  'gebeurtenissen', (select coalesce(json_agg(r order by r.created_at desc), '[]'::json) from (
     select ev.id, ev.event_type as soort, ev.actor, ev.summary as samenvatting, ev.created_at, o.deal_priority as deal_code
     from deal_events ev left join opportunities o on o.id = ev.opportunity_id
     order by ev.created_at desc limit 100) r),
  'deal_automatisering', (select coalesce(json_agg(r), '[]'::json) from (
     select coalesce(automation_status, '(none)') as status, count(*) as aantal, max(last_automation_at) as laatst
     from opportunities where stage <> 'lost' group by 1) r),
  'campagnes', (select coalesce(json_agg(r order by r.prioriteit desc nulls last, r.updated_at desc nulls last), '[]'::json) from (
     select sc.id, sc.direction as richting, sc.commodity, sc.product, sc.search_geographies as gebieden, sc.status,
            sc.priority as prioriteit, sc.candidates_found as gevonden, sc.candidates_screened as gescreend,
            sc.candidates_contacted as benaderd, sc.candidates_qualified as gekwalificeerd,
            sc.next_action as volgende, sc.next_action_at as volgende_op, sc.updated_at
     from sourcing_campaigns sc limit 300) r)
) as data
""",
    # Het werk van de desk, in de vorm waarin de rest van AXE CORE het leest.
    #
    # De taken-, cron- en agenda-tabs groeperen per app (domain/apps.ts). De
    # NorthSea-kolom was daar leeg: de desk schrijft niet in core_tasks maar in
    # deal_tasks/action_queue van AXE Commodities. Die staan hier dus als lijst,
    # zodat ze in dezelfde kolom komen als de rest -- in de kleur van de app.
    "werk": """
select json_build_object(
  'taken', (select coalesce(json_agg(r order by r.prioriteit desc nulls last, r.due_at nulls last), '[]'::json) from (
     select dt.id::text as id, 'deal_task' as bron, dt.title as titel, dt.status, dt.priority as prioriteit,
            dt.due_at, dt.requires_approval as akkoord_nodig, dt.created_at,
            o.deal_priority as deal_code, o.id::text as deal_id
     from deal_tasks dt left join opportunities o on o.id = dt.opportunity_id
     where dt.status in ('open','in_progress','waiting')
     union all
     select aq.id::text, 'action_queue', aq.title, aq.status, aq.priority,
            aq.due_at, aq.requires_approval, aq.created_at,
            o2.deal_priority, o2.id::text
     from action_queue aq left join opportunities o2 on o2.id = aq.opportunity_id
     where aq.status in ('open','in_progress','waiting')
     limit 400) r),
  'agenda', (select coalesce(json_agg(r order by r.wanneer), '[]'::json) from (
     select 'deal:' || o.id::text as id, 'next_action' as soort, o.next_action_at as wanneer,
            coalesce(nullif(o.next_action,''), o.next_best_action) as titel, o.deal_priority as deal_code
     from opportunities o
     where o.stage <> 'lost' and o.next_action_at is not null
     union all
     select 'campagne:' || sc.id::text, 'campagne', sc.next_action_at, sc.next_action, null
     from sourcing_campaigns sc
     where sc.next_action_at is not null
     limit 400) r)
) as data
""",
    "rapporten": """
select json_build_object(
  'fases', (select coalesce(json_agg(r), '[]'::json) from (
     select stage::text as sleutel, count(*) as aantal from opportunities group by 1) r),
  'uitvoering', (select coalesce(json_agg(r), '[]'::json) from (
     select coalesce(nullif(execution_state,''), '(none)') as sleutel, count(*) as aantal
     from opportunities where stage <> 'lost' group by 1) r),
  'commodities', (select coalesce(json_agg(r), '[]'::json) from (
     select lower(coalesce(x.commodity, '(unknown)')) as sleutel, count(*) filter (where x.kant = 'aanbod') as aanbod,
            count(*) filter (where x.kant = 'vraag') as vraag
     from (select commodity, 'aanbod' as kant from supplier_offers
           union all select commodity, 'vraag' from buyer_requirements) x group by 1) r),
  'bedrijf_soorten', (select coalesce(json_agg(r), '[]'::json) from (
     select company_type::text as sleutel, count(*) as aantal from companies group by 1) r),
  'bedrijf_verificatie', (select coalesce(json_agg(r), '[]'::json) from (
     select verification_status::text as sleutel, count(*) as aantal from companies group by 1) r),
  'landen', (select coalesce(json_agg(r order by r.aantal desc), '[]'::json) from (
     select coalesce(nullif(country,''), '(unknown)') as sleutel, count(*) as aantal from companies group by 1) r),
  'communicatie_weken', (select coalesce(json_agg(r order by r.week), '[]'::json) from (
     select date_trunc('week', occurred_at)::date as week,
            count(*) filter (where direction = 'inbound') as inkomend,
            count(*) filter (where direction = 'outbound') as uitgaand,
            count(*) filter (where direction = 'internal') as intern
     from communications where occurred_at > now() - interval '12 weeks' group by 1) r),
  'deals_maanden', (select coalesce(json_agg(r order by r.maand), '[]'::json) from (
     select date_trunc('month', created_at)::date as maand, count(*) as aantal
     from opportunities where created_at > now() - interval '12 months' group by 1) r),
  'gereedheid', (select coalesce(json_agg(r), '[]'::json) from (
     select case when readiness_score is null then '(none)'
                 when readiness_score < 25 then '0-24' when readiness_score < 50 then '25-49'
                 when readiness_score < 75 then '50-74' else '75-100' end as sleutel, count(*) as aantal
     from opportunities where stage <> 'lost' group by 1) r),
  'bewijs', (select coalesce(json_agg(r), '[]'::json) from (
     select coalesce(verification_status, '(none)') as sleutel, count(*) as aantal from deal_evidence group by 1) r),
  'taken', (select coalesce(json_agg(r), '[]'::json) from (
     select 'deal_tasks:' || coalesce(status, '(none)') as sleutel, count(*) as aantal from deal_tasks group by 1
     union all
     select 'action_queue:' || coalesce(status, '(none)'), count(*) from action_queue group by 1) r),
  'totaal', json_build_object(
     'deals', (select count(*) from opportunities where stage <> 'lost'),
     'gewonnen', (select count(*) from opportunities where stage = 'won'),
     'bedrijven', (select count(*) from companies),
     'contacten', (select count(*) from contacts),
     'communicatie_30d', (select count(*) from communications where occurred_at > now() - interval '30 days'),
     'campagnes', (select count(*) from sourcing_campaigns),
     'waarde_ingevuld', (select count(*) from opportunities where estimated_value is not null),
     'commissie_bedragen', (select count(*) from opportunities where commission_amount is not null))
) as data
""",
}

_tab_cache: dict[str, dict[str, Any]] = {}


class NorthseaFout(Exception):
    pass


class OnbekendTabblad(NorthseaFout):
    pass


def lees_rijen(tekst: str) -> list[dict]:
    """De rijen uit het antwoord van de Supabase-MCP.

    Dat antwoord is tekst: een waarschuwing, dan de JSON-array tussen
    <untrusted-data-...>-labels. Alleen die array telt.
    """
    # Soms verpakt in {"result": "..."}; dan eerst die laag eraf.
    try:
        verpakt = json.loads(tekst)
        if isinstance(verpakt, dict) and isinstance(verpakt.get("result"), str):
            tekst = verpakt["result"]
    except (json.JSONDecodeError, TypeError):
        pass
    m = re.search(r"<untrusted-data-[^>]*>\s*(\[.*\])\s*</untrusted-data-", tekst, re.S)
    ruw = m.group(1) if m else (tekst[tekst.find("["): tekst.rfind("]") + 1] if "[" in tekst else "")
    try:
        rijen = json.loads(ruw)
    except json.JSONDecodeError as e:
        raise NorthseaFout(f"onleesbaar antwoord van Supabase: {tekst[:160]}") from e
    return rijen if isinstance(rijen, list) else []


async def _vraag(sql: str) -> dict:
    """Eén query via de alleen-lezen verbinding; het `data`-object uit de enige rij."""
    uit = await mcp_hub.roep(VERBINDING, "execute_sql", {"query": sql})
    if uit.get("status") != "ok":
        raise NorthseaFout(uit.get("error") or "Supabase gaf geen antwoord")
    tekst = " ".join(c.get("text", "") for c in (uit.get("result") or {}).get("content", []) if isinstance(c, dict))
    rijen = lees_rijen(tekst)
    data: Optional[dict] = rijen[0].get("data") if rijen and isinstance(rijen[0], dict) else None
    if not isinstance(data, dict):
        raise NorthseaFout(f"onverwacht antwoord van Supabase: {tekst[:160]}")
    return data


async def overzicht(vers: bool = False) -> dict:
    nu = time.monotonic()
    if not vers and _cache["data"] is not None and nu - _cache["t"] < CACHE_S:
        return _cache["data"]
    data = await _vraag(OVERZICHT_SQL)
    _cache.update(t=nu, data=data)
    return data


async def tab(naam: str, vers: bool = False) -> dict:
    """De data van één tabblad. Een onbekende naam stopt hier, vóór er iets naar Supabase gaat."""
    sql = TAB_SQL.get(naam)
    if sql is None:
        raise OnbekendTabblad(f"onbekend tabblad: {naam[:40]}")
    nu = time.monotonic()
    eerder = _tab_cache.get(naam)
    if not vers and eerder is not None and nu - eerder["t"] < CACHE_S:
        return eerder["data"]
    data = await _vraag(sql)
    _tab_cache[naam] = {"t": nu, "data": data}
    return data
