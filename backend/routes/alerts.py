"""Alert rules + events routes (operator-scoped)."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from routes.auth import get_current_operator

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertRuleIn(BaseModel):
    name: str
    layer: str
    condition: Dict[str, Any]
    enabled: bool = True
    severity: Optional[str] = "MEDIUM"
    throttle_minutes: int = 15


class AlertRule(AlertRuleIn):
    id: str
    email: str
    created_at: str
    last_triggered_at: Optional[str] = None
    trigger_count: int = 0


@router.get("/rules", response_model=List[AlertRule])
async def list_rules(request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    rows = await db.alert_rules.find({"email": email}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


@router.post("/rules", response_model=AlertRule)
async def create_rule(payload: AlertRuleIn, request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    row = {
        "id": uuid.uuid4().hex,
        "email": email,
        "name": payload.name,
        "layer": payload.layer,
        "condition": payload.condition,
        "enabled": payload.enabled,
        "severity": payload.severity,
        "throttle_minutes": payload.throttle_minutes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_triggered_at": None,
        "trigger_count": 0,
    }
    await db.alert_rules.insert_one(row)
    return row


@router.put("/rules/{rid}", response_model=AlertRule)
async def update_rule(rid: str, payload: AlertRuleIn, request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    existing = await db.alert_rules.find_one({"id": rid, "email": email})
    if not existing:
        raise HTTPException(status_code=404, detail="rule not found")
    upd = {**payload.dict()}
    await db.alert_rules.update_one({"id": rid, "email": email}, {"$set": upd})
    row = await db.alert_rules.find_one({"id": rid, "email": email}, {"_id": 0})
    return row


@router.delete("/rules/{rid}")
async def delete_rule(rid: str, request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    res = await db.alert_rules.delete_one({"id": rid, "email": email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="rule not found")
    return {"deleted": True, "id": rid}


@router.get("/events")
async def list_events(request: Request, limit: int = 60, unacknowledged_only: bool = False,
                      _: str = Depends(get_current_operator)):
    db = request.app.state.db
    q = {}
    if unacknowledged_only:
        q["acknowledged"] = False
    rows = await db.alert_events.find(q, {"_id": 0}).sort("triggered_at", -1).limit(min(limit, 200)).to_list(limit)
    unread = await db.alert_events.count_documents({"acknowledged": False})
    return {"unread": unread, "items": rows}


@router.post("/events/{eid}/ack")
async def ack_event(eid: str, request: Request, _: str = Depends(get_current_operator)):
    db = request.app.state.db
    await db.alert_events.update_one({"id": eid}, {"$set": {"acknowledged": True}})
    return {"ok": True, "id": eid}


@router.post("/events/ack-all")
async def ack_all_events(request: Request, _: str = Depends(get_current_operator)):
    db = request.app.state.db
    res = await db.alert_events.update_many({"acknowledged": False}, {"$set": {"acknowledged": True}})
    return {"ok": True, "updated": res.modified_count}


class PresetSeedIn(BaseModel):
    preset: str  # 'starter' | 'trader' | 'osint'


@router.post("/rules/seed-preset")
async def seed_presets(payload: PresetSeedIn, request: Request, email: str = Depends(get_current_operator)):
    """Seed a starter pack of useful alert rules."""
    db = request.app.state.db
    presets = {
        "starter": [
            {"name": "Tesla / SpaceX jet airborne (N628TS)", "layer": "air",
             "condition": {"type": "registry_match", "field": "registration", "values": ["N628TS"]},
             "severity": "HIGH", "throttle_minutes": 30},
            {"name": "Berkshire jet airborne (N1BG)", "layer": "air",
             "condition": {"type": "registry_match", "field": "registration", "values": ["N1BG"]},
             "severity": "HIGH", "throttle_minutes": 30},
            {"name": "Bloomberg jet airborne (N828MH)", "layer": "air",
             "condition": {"type": "registry_match", "field": "registration", "values": ["N828MH"]},
             "severity": "MEDIUM", "throttle_minutes": 30},
            {"name": "Mega-yacht live in Baltic", "layer": "vessel",
             "condition": {"type": "registry_match", "field": "mmsi",
                           "values": [215123100, 215123200, 215123300, 215123700, 215124000, 215124300]},
             "severity": "HIGH", "throttle_minutes": 60},
            {"name": "Significant earthquake mag ≥ 6", "layer": "intel",
             "condition": {"type": "field_threshold", "field": "magnitude", "op": "gte", "value": 6.0},
             "severity": "HIGH", "throttle_minutes": 15},
            {"name": "BTC > $80,000", "layer": "crypto",
             "condition": {"type": "field_threshold", "field": "price_usd", "op": "gt", "value": 80000,
                           "item_id": "crypto_bitcoin"},
             "severity": "MEDIUM", "throttle_minutes": 30},
            {"name": "BTC < $70,000", "layer": "crypto",
             "condition": {"type": "field_threshold", "field": "price_usd", "op": "lt", "value": 70000,
                           "item_id": "crypto_bitcoin"},
             "severity": "MEDIUM", "throttle_minutes": 30},
            {"name": "Thermal hotspot FRP > 100", "layer": "heatmap",
             "condition": {"type": "field_threshold", "field": "frp_num", "op": "gt", "value": 100},
             "severity": "HIGH", "throttle_minutes": 30},
        ],
        "trader": [
            {"name": "Walmart aviation airborne", "layer": "air",
             "condition": {"type": "registry_match", "field": "registration",
                           "values": ["N887WM", "N888WM", "N550WM"]},
             "severity": "MEDIUM", "throttle_minutes": 60},
            {"name": "LVMH executive jet airborne", "layer": "air",
             "condition": {"type": "registry_match", "field": "registration",
                           "values": ["F-GVMA", "F-WWVS"]},
             "severity": "HIGH", "throttle_minutes": 60},
            {"name": "Major container ship in Baltic", "layer": "vessel",
             "condition": {"type": "registry_match", "field": "mmsi",
                           "values": [538008515, 538008516, 215012000, 538007700, 636019825,
                                       219019560, 219018502, 219018880]},
             "severity": "HIGH", "throttle_minutes": 60},
            {"name": "VLCC tanker active", "layer": "vessel",
             "condition": {"type": "meta_threshold", "key": "tanker_count", "op": "gt", "value": 250},
             "severity": "MEDIUM", "throttle_minutes": 60},
            {"name": "ETH > $3,000", "layer": "crypto",
             "condition": {"type": "field_threshold", "field": "price_usd", "op": "gt", "value": 3000,
                           "item_id": "crypto_ethereum"},
             "severity": "MEDIUM", "throttle_minutes": 30},
            {"name": "Crypto move > 5% 24h", "layer": "crypto",
             "condition": {"type": "field_threshold", "field": "change_24h_pct", "op": "gt", "value": 5.0},
             "severity": "MEDIUM", "throttle_minutes": 30},
            {"name": "USD/EUR < 0.90", "layer": "macro",
             "condition": {"type": "field_threshold", "field": "value", "op": "lt", "value": 0.90,
                           "item_id": "macro_fx_eur"},
             "severity": "HIGH", "throttle_minutes": 60},
        ],
        "osint": [
            {"name": "New CVE added (any CISA KEV)", "layer": "intel",
             "condition": {"type": "presence", "field": "category", "op": "equals", "value": "cyber-vuln"},
             "severity": "MEDIUM", "throttle_minutes": 30},
            {"name": "Military aircraft surge (>150)", "layer": "air",
             "condition": {"type": "meta_threshold", "key": "military_count", "op": "gt", "value": 150},
             "severity": "HIGH", "throttle_minutes": 60},
            {"name": "Thermal night detections > 100", "layer": "heatmap",
             "condition": {"type": "meta_threshold", "key": "night_detections", "op": "gt", "value": 100},
             "severity": "HIGH", "throttle_minutes": 30},
            {"name": "News mentions: 'sanctions'", "layer": "news",
             "condition": {"type": "presence", "field": "title", "op": "contains", "value": "sanctions"},
             "severity": "MEDIUM", "throttle_minutes": 30},
            {"name": "News mentions: 'cyberattack'", "layer": "news",
             "condition": {"type": "presence", "field": "title", "op": "contains", "value": "cyberattack"},
             "severity": "HIGH", "throttle_minutes": 15},
            {"name": "Earthquake mag ≥ 5", "layer": "intel",
             "condition": {"type": "field_threshold", "field": "magnitude", "op": "gte", "value": 5.0},
             "severity": "MEDIUM", "throttle_minutes": 15},
        ],
    }
    if payload.preset not in presets:
        raise HTTPException(status_code=400, detail=f"Unknown preset. Choose: {list(presets.keys())}")
    inserted = 0
    for r in presets[payload.preset]:
        # avoid duplicate by name
        ex = await db.alert_rules.find_one({"email": email, "name": r["name"]})
        if ex:
            continue
        row = {
            "id": uuid.uuid4().hex, "email": email, **r,
            "enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_triggered_at": None,
            "trigger_count": 0,
        }
        await db.alert_rules.insert_one(row)
        inserted += 1
    return {"inserted": inserted, "preset": payload.preset}
