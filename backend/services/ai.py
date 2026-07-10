"""AXE AI — Claude Sonnet 4.5 correlation + chat with RAG and self-improving."""
import json
import os
from typing import Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

CORRELATE_SYSTEM = (
    "You are AXE Intelligence — an elite OSINT correlation engine. "
    "You connect signals across news, air activity, maritime, space, macro, crypto, thermal/fire, and intel layers. "
    "Output ONLY valid JSON. No prose, no markdown."
)

CHAT_SYSTEM = (
    "You are AXE Intelligence, the operator's intelligence companion. "
    "You analyze multi-source OSINT (news, air, vessel, space, macro, crypto, thermal, intel) and connect dots. "
    "Be EXTREMELY concise. Operator-grade terse language. Max 4 short bullets per response or 3 short sentences. "
    "When citing data, reference layer + source briefly (e.g., 'per ADS-B', 'per CISA KEV'). "
    "Do not use emojis. Format with terse bullets when useful. No filler, no preamble, no 'I'll analyze' - just the answer."
)


def _clean_json(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.lower().startswith("json"):
            t = t[4:]
        t = t.rsplit("```", 1)[0]
    return t.strip()


def _compact_snapshot(snap: dict) -> dict:
    return {
        "sweep_id": snap.get("sweep_id"),
        "started_at": snap.get("started_at"),
        "events_total": snap.get("events_total"),
        "sources": {
            k: {
                "status": v.get("status"),
                "count": v.get("count"),
                # Keep only 3 samples per source to shrink prompt (was 5)
                "sample": v.get("items", [])[:3],
                **{kk: vv for kk, vv in v.items() if kk in ("theaters", "starlink", "oneweb",
                                                            "active_total", "total_seen", "chokepoints",
                                                            "night_detections", "high_intensity")},
            }
            for k, v in (snap.get("sources") or {}).items()
        },
    }


async def correlate(snapshot: dict) -> dict:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return {"status": "error", "error": "EMERGENT_LLM_KEY missing"}
    compact = _compact_snapshot(snapshot)
    prompt = (
        "Analyze this multi-source intelligence sweep and produce CROSS-SOURCE SIGNALS that link "
        "events across ≥2 different layers (e.g., wildfire+shipping+oil, military air+FX, "
        "thermal+commodities, cyber+crypto, seismic+supply chain).\n\n"
        f"SWEEP:\n{json.dumps(compact, default=str)[:25000]}\n\n"
        "Return JSON exactly:\n"
        '{"headline_risk":"<short phrase>","alert_level":"LOW|ELEVATED|HIGH|CRITICAL",'
        '"signals":[{"id":"sig_1","title":"...","narrative":"2-3 sentences",'
        '"sources_involved":["news","air"],"confidence":"LOW|MEDIUM|HIGH",'
        '"geo_focus":"region","suggested_actions":["...","..."]}],'
        '"leverageable_ideas":[{"id":"idea_1","side":"LONG|SHORT|HEDGE",'
        '"ticker_or_theme":"...","horizon":"HOURS|DAYS|WEEKS",'
        '"confidence":"LOW|MEDIUM|HIGH","thesis":"...","risk":"..."}]}\n'
        "Produce 4-6 signals and 3-5 ideas. Be specific."
    )
    try:
        chat = LlmChat(api_key=key, session_id=f"correlate-{snapshot.get('sweep_id')}",
                       system_message=CORRELATE_SYSTEM).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = raw if isinstance(raw, str) else str(raw)
        parsed = json.loads(_clean_json(text))
        return {"status": "ok", "result": parsed}
    except json.JSONDecodeError as e:
        return {"status": "parse_error", "error": str(e), "raw_preview": text[:500]}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def chat_message(
    session_id: str,
    message: str,
    snapshot: Optional[dict] = None,
    email: Optional[str] = None,
    db = None
) -> str:
    """Process a chat message with optional RAG context and adapted prompts."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return "[AXE offline: missing API key]"
    
    # Build system message - potentially adapted based on feedback
    sys_msg = CHAT_SYSTEM
    
    # Try to load adapted prompt if db and email are available
    if db and email:
        try:
            from services.feedback import get_feedback_collector
            collector = get_feedback_collector(db)
            adapted = await collector.get_adapted_prompt(email, "chat")
            if adapted and adapted != CHAT_SYSTEM:
                sys_msg = adapted
        except Exception:
            pass  # Fall back to default prompt
    
    # Try to inject RAG context from knowledge base
    kb_context = ""
    if db and email:
        try:
            from services.knowledge import get_knowledge_base
            kb = get_knowledge_base(db)
            kb_context = await kb.get_context_for_chat(email, message)
        except Exception:
            pass  # No knowledge base available
    
    if snapshot:
        # Use a very compact summary for chat (counts + headline numbers only, no samples)
        summary = {
            "sweep_id": snapshot.get("sweep_id"),
            "events_total": snapshot.get("events_total"),
            "healthy_sources": snapshot.get("healthy_sources"),
            "sources": {
                k: {
                    "status": v.get("status"),
                    "count": v.get("count"),
                    **{kk: vv for kk, vv in v.items() if kk in (
                        "theaters", "starlink", "oneweb", "active_total",
                        "chokepoints", "night_detections", "high_intensity")},
                    # Include only 2 sample titles for context
                    "top": [
                        {"t": (i.get("title") or i.get("symbol") or i.get("callsign") or "")[:80]}
                        for i in (v.get("items") or [])[:2]
                    ],
                }
                for k, v in (snapshot.get("sources") or {}).items()
            },
        }
        sys_msg += (
            "\n\nCURRENT SWEEP CONTEXT (compact):\n"
            + json.dumps(summary, default=str)[:4000]
        )
    
    # Add knowledge base context if available
    if kb_context:
        sys_msg += f"\n\n{kb_context}"
    
    # Add feedback-driven instructions if available
    if db and email:
        try:
            from services.feedback import get_feedback_collector
            collector = get_feedback_collector(db)
            insights = await collector.get_learning_insights(email)
            if insights.get("suggested_improvements"):
                sys_msg += "\n\n[QUALITY REMINDERS]\n"
                for imp in insights["suggested_improvements"][:3]:
                    sys_msg += f"- {imp}\n"
        except Exception:
            pass
    
    try:
        chat = LlmChat(api_key=key, session_id=session_id, system_message=sys_msg)\
            .with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=message))
        return raw if isinstance(raw, str) else str(raw)
    except Exception as e:
        return f"[AXE error: {e}]"
