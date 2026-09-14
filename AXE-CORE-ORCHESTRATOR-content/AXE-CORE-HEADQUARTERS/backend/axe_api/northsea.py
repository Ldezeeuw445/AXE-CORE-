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
            cb.country as koper_land, cb.city as koper_stad
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


class NorthseaFout(Exception):
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


async def overzicht(vers: bool = False) -> dict:
    nu = time.monotonic()
    if not vers and _cache["data"] is not None and nu - _cache["t"] < CACHE_S:
        return _cache["data"]
    uit = await mcp_hub.roep(VERBINDING, "execute_sql", {"query": OVERZICHT_SQL})
    if uit.get("status") != "ok":
        raise NorthseaFout(uit.get("error") or "Supabase gaf geen antwoord")
    tekst = " ".join(c.get("text", "") for c in (uit.get("result") or {}).get("content", []) if isinstance(c, dict))
    rijen = lees_rijen(tekst)
    data: Optional[dict] = rijen[0].get("data") if rijen and isinstance(rijen[0], dict) else None
    if not isinstance(data, dict):
        raise NorthseaFout(f"onverwacht antwoord van Supabase: {tekst[:160]}")
    _cache.update(t=nu, data=data)
    return data
