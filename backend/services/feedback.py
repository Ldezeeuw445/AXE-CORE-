"""AXE Self-Improving Loop — feedback collection, pattern analysis, prompt adaptation.

Tracks user feedback (thumbs up/down) on chat responses, analyzes patterns,
and adapts system prompts to improve response quality over time.
"""
import json
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict

from motor.motor_asyncio import AsyncIOMotorDatabase


# Base system prompts that can be adapted
DEFAULT_CORRELATE_SYSTEM = (
    "You are AXE Intelligence — an elite OSINT correlation engine. "
    "You connect signals across news, air activity, maritime, space, macro, crypto, thermal/fire, and intel layers. "
    "Output ONLY valid JSON. No prose, no markdown."
)

DEFAULT_CHAT_SYSTEM = (
    "You are AXE Intelligence, the operator's intelligence companion. "
    "You analyze multi-source OSINT (news, air, vessel, space, macro, crypto, thermal, intel) and connect dots. "
    "Be EXTREMELY concise. Operator-grade terse language. Max 4 short bullets per response or 3 short sentences. "
    "When citing data, reference layer + source briefly (e.g., 'per ADS-B', 'per CISA KEV'). "
    "Do not use emojis. Format with terse bullets when useful. No filler, no preamble, no 'I'll analyze' - just the answer."
)


class FeedbackCollector:
    """Collects and processes user feedback on AI responses."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.feedback_collection = db.feedback
        self.learning_collection = db.learning_log
        self.prompt_collection = db.adapted_prompts

    async def record_feedback(
        self,
        session_id: str,
        email: str,
        message_id: str,
        user_message: str,
        axe_response: str,
        rating: int,  # 1 = thumbs up, -1 = thumbs down, 0 = neutral
        category: Optional[str] = None,
        comment: Optional[str] = None
    ) -> dict:
        """Record user feedback on a chat response."""
        doc = {
            "session_id": session_id,
            "email": email,
            "message_id": message_id,
            "user_message": user_message,
            "axe_response": axe_response[:2000],  # Truncate long responses
            "rating": rating,
            "category": category or "general",
            "comment": comment,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.feedback_collection.insert_one(doc)

        # Log the learning signal
        await self._log_learning_signal(email, rating, category, user_message, axe_response)

        return {"status": "ok", "feedback_id": str(doc.get("_id"))}

    async def _log_learning_signal(
        self,
        email: str,
        rating: int,
        category: Optional[str],
        user_message: str,
        axe_response: str
    ):
        """Log a learning signal for pattern analysis."""
        signal = {
            "email": email,
            "rating": rating,
            "category": category or "general",
            "user_message_preview": user_message[:200],
            "response_preview": axe_response[:200],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.learning_collection.insert_one(signal)

    async def get_feedback_stats(self, email: str, days: int = 7) -> dict:
        """Get feedback statistics for a user."""
        from_date = datetime.now(timezone.utc).isoformat().replace(
            datetime.now(timezone.utc).isoformat()[10:], "T00:00:00+00:00"
        )
        # Simple stats - count ratings
        pipeline = [
            {"$match": {"email": email}},
            {"$group": {
                "_id": "$rating",
                "count": {"$sum": 1}
            }}
        ]
        results = await self.feedback_collection.aggregate(pipeline).to_list(10)

        stats = {"total": 0, "positive": 0, "negative": 0, "neutral": 0}
        for r in results:
            stats["total"] += r["count"]
            if r["_id"] == 1:
                stats["positive"] = r["count"]
            elif r["_id"] == -1:
                stats["negative"] = r["count"]
            else:
                stats["neutral"] = r["count"]

        # Get recent feedback items
        recent = await self.feedback_collection.find(
            {"email": email},
            {"_id": 0, "user_message": 1, "rating": 1, "category": 1, "created_at": 1}
        ).sort("created_at", -1).limit(20).to_list(20)

        stats["recent"] = recent
        return stats

    async def get_learning_insights(self, email: str) -> dict:
        """Analyze feedback patterns and generate insights."""
        # Get all feedback for user
        feedbacks = await self.feedback_collection.find(
            {"email": email, "rating": -1},
            {"_id": 0, "user_message": 1, "axe_response": 1, "category": 1, "comment": 1}
        ).sort("created_at", -1).limit(50).to_list(50)

        # Count negative feedback by category
        category_counts = {}
        for f in feedbacks:
            cat = f.get("category", "general")
            category_counts[cat] = category_counts.get(cat, 0) + 1

        # Common issues from comments
        common_issues = []
        for f in feedbacks:
            if f.get("comment"):
                common_issues.append(f["comment"])

        return {
            "negative_feedback_count": len(feedbacks),
            "category_breakdown": category_counts,
            "common_issues": common_issues[:10],
            "suggested_improvements": self._generate_suggestions(category_counts)
        }

    def _generate_suggestions(self, category_counts: dict) -> List[str]:
        """Generate improvement suggestions based on feedback patterns."""
        suggestions = []
        category_to_suggestion = {
            "too_verbose": "Responses are too long — add stricter length constraints",
            "not_concise": "Responses need to be more terse and direct",
            "missing_context": "Responses lack sufficient OSINT context — include more source references",
            "wrong_analysis": "Analysis quality needs improvement — add cross-validation steps",
            "bad_format": "Response formatting needs improvement — enforce consistent structure",
            "unclear": "Responses are unclear — require explicit confidence levels",
            "general": "General quality improvement needed",
        }
        for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
            suggestion = category_to_suggestion.get(cat, f"Improve {cat}")
            suggestions.append(f"{suggestion} ({count} instances)")
        return suggestions

    async def get_adapted_prompt(self, email: str, prompt_type: str = "chat") -> str:
        """Get the adapted system prompt for a user, incorporating learnings."""
        # Get base prompt
        base = DEFAULT_CHAT_SYSTEM if prompt_type == "chat" else DEFAULT_CORRELATE_SYSTEM

        # Get user's feedback-driven adaptations
        adaptations = await self.prompt_collection.find_one(
            {"email": email, "prompt_type": prompt_type},
            {"_id": 0, "additions": 1}
        )

        if adaptations and adaptations.get("additions"):
            additions = "\n\n[ADAPTED BASED ON FEEDBACK]\n" + "\n".join(
                f"- {a}" for a in adaptations["additions"]
            )
            return base + additions

        return base

    async def update_prompt_adaptation(
        self,
        email: str,
        prompt_type: str,
        new_addition: str
    ):
        """Add a new adaptation rule to the prompt."""
        await self.prompt_collection.update_one(
            {"email": email, "prompt_type": prompt_type},
            {"$push": {"additions": new_addition},
             "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )

    async def auto_adapt(self, email: str):
        """Automatically adapt prompts based on recent feedback patterns."""
        insights = await self.get_learning_insights(email)

        # If too many negative feedbacks, trigger adaptation
        if insights["negative_feedback_count"] >= 3:
            for cat, count in insights["category_breakdown"].items():
                if count >= 2:  # Pattern detected
                    adaptation = self._category_to_adaptation(cat)
                    if adaptation:
                        await self.update_prompt_adaptation(
                            email, "chat", adaptation
                        )

        return insights

    def _category_to_adaptation(self, category: str) -> Optional[str]:
        """Convert a feedback category to a prompt adaptation."""
        adaptations = {
            "too_verbose": "STRICT LENGTH LIMIT: Maximum 3 bullets or 2 sentences. Never exceed.",
            "not_concise": "TERSE MODE: Every word must carry intelligence value. Remove all filler.",
            "missing_context": "CITE SOURCES: Always reference the specific layer and source (e.g., 'per ADS-B track', 'per CISA KEV').",
            "wrong_analysis": "CONFIDENCE FLAG: Always prefix analysis with confidence level (HIGH/MEDIUM/LOW) and explain why.",
            "bad_format": "FORMAT: Use consistent bullet format with layer tags [NEWS][AIR][VESSEL][SPACE][MACRO][CRYPTO][THERMAL][INTEL].",
            "unclear": "CLARITY: Use concrete numbers, names, and locations. Avoid vague qualifiers like 'some' or 'recent'.",
        }
        return adaptations.get(category)


# Singleton instance
_feedback_collector = None


def get_feedback_collector(db: AsyncIOMotorDatabase) -> FeedbackCollector:
    global _feedback_collector
    if _feedback_collector is None:
        _feedback_collector = FeedbackCollector(db)
    return _feedback_collector
