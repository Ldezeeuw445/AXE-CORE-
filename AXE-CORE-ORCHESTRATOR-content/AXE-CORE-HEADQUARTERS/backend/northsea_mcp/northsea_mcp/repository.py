"""Toegang tot AXE Commodities, getypt en zonder vrije SQL.

Via PostgREST (de REST-laag van Supabase) met de service-role van het project,
precies zoals de bestaande edge functions `northsea-desk` en
`send-approved-reply` het doen. Er staat nergens een SQL-string: elke methode is
één vaste vraag met gevalideerde ids, zodat een tool-argument nooit een query
kan worden.

Verzenden gaat NIET langs Resend vanuit hier, maar via de edge function
`send-approved-reply`. Daar staan al de controles (goedgekeurd, niet eerder
verstuurd, compleet) en de Resend-Idempotency-Key -- één verzendpad voor desk,
AXE CORE en MCP.
"""
from __future__ import annotations

import re
from typing import Any

import httpx

UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

ACTIVE = "(draft,active,paused,matched)"


# Kolommen per tabel voor de leeslaag. Bewust zonder transcript, raw_event en
# bestandsinhoud: te groot en te persoonlijk voor een tool-antwoord.
SNAPSHOT_SELECT: dict[str, str] = {
    "opportunities": "*",
    "buyer_requirements": "*",
    "supplier_offers": "*",
    "companies": "*",
    "contacts": "id,company_id,full_name,role,email,phone,linkedin_url,is_primary,verification_status,contact_policy,contact_policy_reason,"
                "email_status,email_status_at,email_status_reason,created_at,updated_at",
    "communications": "id,company_id,contact_id,opportunity_id,direction,channel,subject,body,external_message_id,occurred_at,"
                      "created_at,delivery_status,delivery_status_at,is_synthetic,synthetic_reason,mapping_status,mapping_basis,"
                      "mapping_candidates,from_address,reply_to_address,transport,actor_type,actor,approval_basis,reply_draft_id",
    "email_intelligence": "*",
    "northsea_followups": "*",
    "northsea_audit_events": "id,occurred_at,actor_type,actor,action,communication_id,opportunity_id,company_id,contact_id,draft_id,details",
    "call_intelligence": "id,communication_id,external_call_id,call_status,duration_seconds,summary,caller_type,commodity,product,"
                         "grade,quantity_mt,frequency,origin,destination,incoterm,payment_terms,urgency,requires_human_review,is_synthetic,"
                         "created_at,updated_at",
    "reply_drafts": "id,communication_id,company_id,contact_id,opportunity_id,to_email,subject,body,purpose,approval_status,"
                    "lifecycle_state,approval_actor_type,approved_by,approval_channel,policy_decision,"
                    "sensitive_action,generated_by,approved_at,sent_at,resend_email_id,created_at,updated_at",
    "deal_tasks": "*",
    "action_queue": "*",
    "deal_events": "id,opportunity_id,event_type,actor,summary,created_at",
    "deal_evidence": "*",
    "deal_documents": "*",
    "inbound_email_attachments": "id,resend_email_id,company_id,contact_id,opportunity_id,filename,content_type,size,created_at",
    "verification_checks": "*",
    "match_assessments": "*",
    "sourcing_campaigns": "*",
    "sourcing_candidates": "id,campaign_id,company_id,candidate_name,source_type,fit_score,status,last_contacted_at,created_at,updated_at",
    "deal_automation_policy": "*",
    "commissions": "*",
}


GUARD_CODE = re.compile(r"NS_(?:CONTACT_POLICY|APPROVAL_INTEGRITY|OUTBOUND_PROVENANCE|POLICY|SYNTHETIC)[^\"]{0,80}")


class RepositoryError(RuntimeError):
    """Een databasefout. De tekst is veilig: geen sleutels, geen query."""


class InvalidId(ValueError):
    pass


def uid(value: Any, naam: str = "id") -> str:
    s = str(value or "").strip()
    if not UUID.match(s):
        raise InvalidId(f"{naam} must be a UUID")
    return s.lower()


def _like(value: str) -> str:
    # PostgREST: * is het jokerteken; komma's en haakjes breken een or=()-lijst.
    return re.sub(r"[*,()\\\"]", " ", value).strip()[:120]


class SupabaseRepository:
    def __init__(self, url: str, key: str, timeout: float = 20.0, client: httpx.AsyncClient | None = None):
        self._url = url.rstrip("/")
        self._headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        self._client = client or httpx.AsyncClient(timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, table: str, params: dict[str, str]) -> list[dict]:
        try:
            r = await self._client.get(f"{self._url}/rest/v1/{table}", params=params, headers=self._headers)
        except httpx.HTTPError as e:
            raise RepositoryError(f"database unreachable ({type(e).__name__})") from e
        if r.status_code >= 400:
            raise RepositoryError(f"database read failed for {table} ({r.status_code})")
        data = r.json()
        return data if isinstance(data, list) else []

    async def _one(self, table: str, params: dict[str, str]) -> dict | None:
        rows = await self._get(table, {**params, "limit": "1"})
        return rows[0] if rows else None

    async def _write(self, method: str, table: str, params: dict[str, str] | None, body: dict) -> list[dict]:
        try:
            r = await self._client.request(method, f"{self._url}/rest/v1/{table}", params=params or {},
                                           headers={**self._headers, "Prefer": "return=representation"}, json=body)
        except httpx.HTTPError as e:
            raise RepositoryError(f"database unreachable ({type(e).__name__})") from e
        if r.status_code >= 400:
            # De P0/P1-guards melden zich met een vaste code; die mag door (geen query, geen sleutel).
            code = GUARD_CODE.search(r.text or "")
            raise RepositoryError(f"database write failed for {table} ({r.status_code})"
                                  + (f": {code.group(0)}" if code else "") + (": duplicate" if "23505" in (r.text or "") else ""))
        data = r.json() if r.content else []
        return data if isinstance(data, list) else [data]

    # ── Engine (P1): alleen deze tabellen, alleen deze bewerkingen ────────────
    ENGINE_TABLES = frozenset({"email_intelligence", "opportunities", "northsea_followups", "reply_drafts", "action_queue",
                               "contacts", "deal_evidence", "deal_events", "northsea_audit_events"})

    async def engine_insert(self, table: str, row: dict, *, on_conflict: str | None = None, ignore_duplicates: bool = False) -> list[dict]:
        if table not in self.ENGINE_TABLES:
            raise RepositoryError(f"engine may not write {table}")
        params = {"on_conflict": on_conflict} if on_conflict else {}
        prefer = "return=representation" + (",resolution=ignore-duplicates" if ignore_duplicates else "")
        try:
            r = await self._client.post(f"{self._url}/rest/v1/{table}", params=params, headers={**self._headers, "Prefer": prefer}, json=row)
        except httpx.HTTPError as e:
            raise RepositoryError(f"database unreachable ({type(e).__name__})") from e
        if r.status_code >= 400:
            if ignore_duplicates and (r.status_code == 409 or "23505" in (r.text or "")):
                return []
            code = GUARD_CODE.search(r.text or "")
            raise RepositoryError(f"database write failed for {table} ({r.status_code})" + (f": {code.group(0)}" if code else "")
                                  + (": duplicate" if "23505" in (r.text or "") else ""))
        data = r.json() if r.content else []
        return data if isinstance(data, list) else [data]

    async def engine_patch(self, table: str, filters: dict[str, str], body: dict) -> list[dict]:
        if table not in self.ENGINE_TABLES or not filters:
            raise RepositoryError(f"engine may not patch {table}")
        return await self._write("PATCH", table, filters, body)

    # ── Gezondheid ────────────────────────────────────────────────────────────
    async def ping(self) -> bool:
        await self._get("opportunities", {"select": "id", "limit": "1"})
        return True

    # ── Lezen ─────────────────────────────────────────────────────────────────
    async def get_opportunity(self, opportunity_id: str) -> dict | None:
        return await self._one("opportunities", {
            "id": f"eq.{uid(opportunity_id, 'opportunity_id')}",
            "select": "*,buyer_requirements(*,companies(*)),supplier_offers(*,companies(*))",
        })

    async def get_requirement(self, requirement_id: str) -> dict | None:
        return await self._one("buyer_requirements", {
            "id": f"eq.{uid(requirement_id, 'buyer_requirement_id')}", "select": "*,companies(*)"})

    async def get_offer(self, offer_id: str) -> dict | None:
        return await self._one("supplier_offers", {
            "id": f"eq.{uid(offer_id, 'supplier_offer_id')}", "select": "*,companies(*)"})

    async def get_company(self, company_id: str) -> dict | None:
        return await self._one("companies", {"id": f"eq.{uid(company_id, 'counterparty_id')}", "select": "*"})

    async def list_contacts(self, company_id: str) -> list[dict]:
        return await self._get("contacts", {"company_id": f"eq.{uid(company_id)}", "select": "*",
                                             "order": "is_primary.desc,updated_at.desc", "limit": "20"})

    async def list_verification_checks(self, company_id: str) -> list[dict]:
        return await self._get("verification_checks", {"company_id": f"eq.{uid(company_id)}", "select": "*",
                                                       "order": "checked_at.desc.nullslast", "limit": "50"})

    async def list_company_offers(self, company_id: str) -> list[dict]:
        return await self._get("supplier_offers", {"company_id": f"eq.{uid(company_id)}", "select": "*", "limit": "50"})

    async def list_company_requirements(self, company_id: str) -> list[dict]:
        return await self._get("buyer_requirements", {"company_id": f"eq.{uid(company_id)}", "select": "*", "limit": "50"})

    async def list_communications(self, *, opportunity_id: str | None = None, company_id: str | None = None,
                                  limit: int = 10) -> list[dict]:
        params = {"select": "id,company_id,contact_id,opportunity_id,direction,channel,subject,body,occurred_at,delivery_status",
                  "order": "occurred_at.desc.nullslast", "limit": str(max(1, min(limit, 50)))}
        if opportunity_id:
            params["opportunity_id"] = f"eq.{uid(opportunity_id)}"
        elif company_id:
            params["company_id"] = f"eq.{uid(company_id)}"
        else:
            return []
        return await self._get("communications", params)

    async def get_communication(self, communication_id: str) -> dict | None:
        return await self._one("communications", {"id": f"eq.{uid(communication_id, 'communication_id')}", "select": "*"})

    async def get_email_intelligence(self, communication_id: str) -> dict | None:
        return await self._one("email_intelligence", {"communication_id": f"eq.{uid(communication_id)}", "select": "*"})

    async def get_call_intelligence(self, communication_id: str) -> dict | None:
        return await self._one("call_intelligence", {
            "communication_id": f"eq.{uid(communication_id)}",
            # raw_event en transcript blijven hier: te groot en te persoonlijk voor een tool-antwoord.
            "select": "id,communication_id,caller_type,call_status,duration_seconds,summary,commodity,product,grade,"
                      "quantity_mt,frequency,origin,destination,incoterm,payment_terms,urgency,requires_human_review,created_at"})

    async def list_drafts_for_communication(self, communication_id: str) -> list[dict]:
        return await self._get("reply_drafts", {"communication_id": f"eq.{uid(communication_id)}",
                                                "select": "id,subject,body,approval_status,sent_at,created_at,sensitive_action",
                                                "order": "created_at.desc", "limit": "5"})

    async def list_evidence(self, opportunity_id: str) -> list[dict]:
        return await self._get("deal_evidence", {"opportunity_id": f"eq.{uid(opportunity_id)}", "select": "*",
                                                 "order": "created_at.desc", "limit": "100"})

    async def list_deal_tasks(self, opportunity_id: str, open_only: bool = False) -> list[dict]:
        params = {"opportunity_id": f"eq.{uid(opportunity_id)}", "select": "*", "order": "priority.desc.nullslast,due_at.asc.nullslast", "limit": "100"}
        if open_only:
            params["status"] = "in.(open,waiting,in_progress)"
        return await self._get("deal_tasks", params)

    async def get_task(self, task_id: str) -> dict | None:
        return await self._one("deal_tasks", {"id": f"eq.{uid(task_id, 'task_id')}", "select": "*"})

    async def list_action_queue(self, opportunity_id: str) -> list[dict]:
        return await self._get("action_queue", {"opportunity_id": f"eq.{uid(opportunity_id)}",
                                                # check-constraint: open, in_progress, waiting, completed, cancelled
                                                "status": "in.(open,in_progress,waiting)", "select": "id,action_type,title,description,priority,status,requires_approval,due_at,created_at",
                                                "order": "priority.desc.nullslast", "limit": "50"})

    async def list_deal_events(self, opportunity_id: str, limit: int = 10) -> list[dict]:
        return await self._get("deal_events", {"opportunity_id": f"eq.{uid(opportunity_id)}", "select": "id,event_type,actor,summary,created_at",
                                               "order": "created_at.desc", "limit": str(limit)})

    async def get_match_assessment(self, requirement_id: str, offer_id: str) -> dict | None:
        return await self._one("match_assessments", {
            "buyer_requirement_id": f"eq.{uid(requirement_id)}", "supplier_offer_id": f"eq.{uid(offer_id)}",
            "select": "*", "order": "assessed_at.desc.nullslast"})

    async def find_opportunity_for_pair(self, requirement_id: str, offer_id: str) -> dict | None:
        return await self._one("opportunities", {
            "buyer_requirement_id": f"eq.{uid(requirement_id)}", "supplier_offer_id": f"eq.{uid(offer_id)}", "select": "id,stage"})

    async def list_active_offers(self, limit: int = 200) -> list[dict]:
        return await self._get("supplier_offers", {"status": f"in.{ACTIVE}", "select": "*,companies(*)", "limit": str(limit)})

    async def list_active_requirements(self, limit: int = 200) -> list[dict]:
        return await self._get("buyer_requirements", {"status": f"in.{ACTIVE}", "select": "*,companies(*)", "limit": str(limit)})

    async def list_company_domains(self, limit: int = 2000) -> list[dict]:
        return await self._get("companies", {"select": "id,company_name,website,source_url", "limit": str(limit)})

    async def get_policy(self) -> dict:
        return await self._one("deal_automation_policy", {"select": "*", "order": "id.asc"}) or {}

    async def get_draft(self, draft_id: str) -> dict | None:
        return await self._one("reply_drafts", {"id": f"eq.{uid(draft_id, 'draft_id')}", "select": "*"})

    # ── Hele tabellen, voor de leeslaag (inspect.py) ──────────────────────────
    async def fetch_all(self, table: str, max_rows: int = 5000) -> tuple[list[dict], bool]:
        """Een tabel in pagina's van 1000, met vaste kolommen per tabel.

        Alleen tabellen uit SNAPSHOT_SELECT; een tool-argument kiest nooit een
        tabel of kolom. Geeft (rijen, afgekapt) terug zodat een antwoord kan
        zeggen dat het niet alles zag, in plaats van stil te tellen op een deel.
        """
        select = SNAPSHOT_SELECT[table]
        rows: list[dict] = []
        offset = 0
        while offset < max_rows:
            page = await self._get(table, {"select": select, "order": "id.asc", "limit": "1000", "offset": str(offset)})
            rows += page
            if len(page) < 1000:
                return rows, False
            offset += 1000
        return rows[:max_rows], True

    # ── Schrijven (alleen wat de write-tools nodig hebben) ────────────────────
    async def insert_deal_task(self, row: dict) -> dict:
        return (await self._write("POST", "deal_tasks", None, row))[0]

    async def update_deal_task(self, task_id: str, expected_updated_at: str | None, patch: dict) -> dict | None:
        params = {"id": f"eq.{uid(task_id, 'task_id')}"}
        if expected_updated_at:
            params["updated_at"] = f"eq.{expected_updated_at}"
        rows = await self._write("PATCH", "deal_tasks", params, patch)
        return rows[0] if rows else None

    async def insert_reply_draft(self, row: dict) -> dict:
        return (await self._write("POST", "reply_drafts", None, row))[0]

    async def update_draft_if(self, draft_id: str, expected_updated_at: str, patch: dict) -> dict | None:
        """Optimistisch: alleen als niemand de draft intussen veranderde (zoals northsea-desk)."""
        rows = await self._write("PATCH", "reply_drafts",
                                 {"id": f"eq.{uid(draft_id, 'draft_id')}", "updated_at": f"eq.{expected_updated_at}"}, patch)
        return rows[0] if rows else None

    async def insert_deal_event(self, row: dict) -> None:
        await self._write("POST", "deal_events", None, row)

    async def outbound_block_reason(self, *, company_id: str | None = None, contact_id: str | None = None, email: str | None = None,
                                    opportunity_id: str | None = None) -> str | None:
        """Contactbeleid uit de database (dezelfde functie die de triggers gebruiken). Fout -> RepositoryError (dicht)."""
        body = {"p_company_id": uid(company_id) if company_id else None, "p_contact_id": uid(contact_id) if contact_id else None,
                "p_email": email or None, "p_opportunity_id": uid(opportunity_id) if opportunity_id else None}
        try:
            r = await self._client.post(f"{self._url}/rest/v1/rpc/northsea_outbound_block_reason", headers=self._headers, json=body)
        except httpx.HTTPError as e:
            raise RepositoryError(f"contact policy unreachable ({type(e).__name__})") from e
        if r.status_code >= 400:
            raise RepositoryError(f"contact policy check failed ({r.status_code})")
        waarde = r.json()
        if waarde in (None, "do_not_contact", "synthetic", "bounced_channel", "review_required"):
            return waarde
        return "do_not_contact"

    async def send_approved_reply(self, draft_id: str, requested_by: str | None = None) -> dict:
        try:
            r = await self._client.post(f"{self._url}/functions/v1/send-approved-reply",
                                        headers=self._headers, json={"draft_id": uid(draft_id, "draft_id"), "requested_by": requested_by}, timeout=60)
        except httpx.HTTPError as e:
            raise RepositoryError(f"send function unreachable ({type(e).__name__})") from e
        try:
            body = r.json()
        except ValueError:
            body = {}
        body["_status"] = r.status_code
        return body


def name_like(value: str) -> str:
    return _like(value)
