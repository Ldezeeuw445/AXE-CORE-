"""Alerts engine — evaluates rule conditions against latest sweep snapshot.

Rule schema (stored in `db.alert_rules`):
  {
    id, email, name, enabled, layer, condition, throttle_minutes,
    last_triggered_at, trigger_count, created_at
  }

Condition shapes:
  - registry_match  { type, field='registration'|'mmsi'|'icao24', values:[...] }
  - field_threshold { type, item_id?, field, op:'gt'|'lt'|'gte'|'lte'|'eq'|'change_pct_gt', value, source_id? }
  - presence        { type, field, op:'contains'|'equals', value, in:'items'|'meta' }
  - meta_threshold  { type, key, op, value }  # operates on top-level adapter metadata e.g. theaters

Triggered alerts stored in `db.alert_events`:
  { id, rule_id, name, email, layer, severity, summary, payload, triggered_at, acknowledged }
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat() if dt else None


def _within_throttle(rule, now):
    last = rule.get("last_triggered_at")
    throttle = int(rule.get("throttle_minutes") or 15)
    if not last:
        return False
    try:
        ts = datetime.fromisoformat(str(last))
    except Exception:
        return False
    return (now - ts) < timedelta(minutes=throttle)


def _eval_registry_match(rule, source):
    cond = rule.get("condition") or {}
    field = cond.get("field", "registration")
    values = set(map(str, cond.get("values") or []))
    if not values:
        return None
    hits = []
    for it in (source.get("items") or []):
        v = it.get(field)
        if v is None:
            continue
        if str(v).upper() in {x.upper() for x in values}:
            hits.append({
                "id": it.get("id"), "value": v,
                "label": it.get("owner") or it.get("impact_name") or it.get("name") or it.get("callsign") or v,
                "altitude_ft": it.get("altitude_ft"),
                "lat": it.get("lat"), "lon": it.get("lon"),
                "ticker": it.get("ticker"),
                "sector": it.get("sector"),
            })
    if hits:
        sample = hits[0]
        return {
            "summary": f"{rule['name']} — {sample.get('label')} ({sample.get('value')}) live",
            "severity": rule.get("severity") or "MEDIUM",
            "payload": {"hits": hits[:25], "hit_count": len(hits)},
        }
    return None


def _compare(op, lhs, rhs):
    if lhs is None or rhs is None:
        return False
    try:
        if op == "gt":  return float(lhs) > float(rhs)
        if op == "gte": return float(lhs) >= float(rhs)
        if op == "lt":  return float(lhs) < float(rhs)
        if op == "lte": return float(lhs) <= float(rhs)
        if op == "eq":  return str(lhs) == str(rhs)
    except Exception:
        return False
    return False


def _eval_field_threshold(rule, source):
    cond = rule.get("condition") or {}
    field = cond.get("field")
    op = cond.get("op")
    value = cond.get("value")
    item_id = cond.get("item_id")
    if item_id:
        # locate a specific item by id
        item = next((x for x in (source.get("items") or []) if x.get("id") == item_id), None)
        if not item:
            return None
        lhs = item.get(field)
        if _compare(op, lhs, value):
            return {
                "summary": f"{rule['name']} — {item.get('title') or item.get('name') or item_id} · {field} {op} {value} (actual {lhs})",
                "severity": rule.get("severity") or "MEDIUM",
                "payload": {"item": item, "field": field, "op": op, "threshold": value, "actual": lhs},
            }
        return None
    # otherwise, evaluate across all items, find first/most that exceeds
    hits = []
    for it in (source.get("items") or []):
        if _compare(op, it.get(field), value):
            hits.append({"id": it.get("id"), "actual": it.get(field),
                         "label": it.get("title") or it.get("name") or it.get("id")})
    if hits:
        return {
            "summary": f"{rule['name']} — {len(hits)} item(s) match {field} {op} {value}",
            "severity": rule.get("severity") or "MEDIUM",
            "payload": {"hits": hits[:30], "field": field, "op": op, "threshold": value},
        }
    return None


def _eval_meta_threshold(rule, source):
    cond = rule.get("condition") or {}
    key = cond.get("key")
    op = cond.get("op")
    value = cond.get("value")
    actual = source.get(key)
    if actual is None:
        return None
    if _compare(op, actual, value):
        return {
            "summary": f"{rule['name']} — {key}={actual} {op} {value}",
            "severity": rule.get("severity") or "MEDIUM",
            "payload": {"key": key, "actual": actual, "op": op, "threshold": value},
        }
    return None


def _eval_presence(rule, source):
    cond = rule.get("condition") or {}
    field = cond.get("field")
    op = cond.get("op", "contains")
    value = (cond.get("value") or "").lower()
    if not field or not value:
        return None
    hits = []
    for it in (source.get("items") or []):
        v = it.get(field)
        if v is None: continue
        sv = str(v).lower()
        if op == "contains" and value in sv:
            hits.append(it)
        elif op == "equals" and value == sv:
            hits.append(it)
    if hits:
        return {
            "summary": f"{rule['name']} — {len(hits)} match(es) for {field} {op} '{value}'",
            "severity": rule.get("severity") or "LOW",
            "payload": {"hits": [{"id": h.get("id"), "title": h.get("title") or h.get("name")} for h in hits[:30]]},
        }
    return None


EVALUATORS = {
    "registry_match": _eval_registry_match,
    "field_threshold": _eval_field_threshold,
    "meta_threshold": _eval_meta_threshold,
    "presence": _eval_presence,
}


async def evaluate_all(db, snapshot):
    """Run every enabled rule against current snapshot, persist new events, return new events."""
    if not snapshot:
        return []
    rules = await db.alert_rules.find({"enabled": True}, {"_id": 0}).to_list(500)
    if not rules:
        return []
    now = _now()
    new_events = []
    for rule in rules:
        if _within_throttle(rule, now):
            continue
        layer = rule.get("layer")
        source = (snapshot.get("sources") or {}).get(layer)
        if not source or source.get("status") == "error":
            continue
        cond = rule.get("condition") or {}
        evaluator = EVALUATORS.get(cond.get("type"))
        if not evaluator:
            continue
        try:
            result = evaluator(rule, source)
        except Exception as e:
            result = None
        if not result:
            continue
        event = {
            "id": uuid.uuid4().hex,
            "rule_id": rule["id"],
            "name": rule.get("name"),
            "email": rule.get("email"),
            "layer": layer,
            "severity": result.get("severity") or "MEDIUM",
            "summary": result.get("summary"),
            "payload": result.get("payload"),
            "triggered_at": _iso(now),
            "acknowledged": False,
            "sweep_id": snapshot.get("sweep_id"),
        }
        try:
            await db.alert_events.insert_one(event)
        except Exception:
            pass
        # update rule throttle / counters
        try:
            await db.alert_rules.update_one(
                {"id": rule["id"]},
                {"$set": {"last_triggered_at": _iso(now)}, "$inc": {"trigger_count": 1}},
            )
        except Exception:
            pass
        new_events.append(event)
    # cap collection
    try:
        cnt = await db.alert_events.count_documents({})
        if cnt > 2000:
            old = await db.alert_events.find({}, {"_id": 1}).sort("triggered_at", 1).limit(cnt - 2000).to_list(cnt - 2000)
            if old:
                await db.alert_events.delete_many({"_id": {"$in": [o["_id"] for o in old]}})
    except Exception:
        pass
    return new_events
