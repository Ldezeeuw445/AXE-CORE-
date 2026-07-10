"""AXE Feedback routes — user feedback collection and learning insights."""
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.feedback import get_feedback_collector

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    session_id: str
    message_id: str
    user_message: str
    axe_response: str
    rating: int  # 1 = thumbs up, -1 = thumbs down
    category: Optional[str] = None
    comment: Optional[str] = None


class FeedbackResponse(BaseModel):
    status: str
    feedback_id: Optional[str] = None


class PromptAdaptationRequest(BaseModel):
    prompt_type: str = "chat"
    addition: str


@router.post("/submit", response_model=FeedbackResponse)
async def submit_feedback(
    req: FeedbackRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Submit feedback on an AXE response."""
    db = request.app.state.db
    collector = get_feedback_collector(db)
    result = await collector.record_feedback(
        session_id=req.session_id,
        email=email,
        message_id=req.message_id,
        user_message=req.user_message,
        axe_response=req.axe_response,
        rating=req.rating,
        category=req.category,
        comment=req.comment
    )
    return FeedbackResponse(status="ok", feedback_id=result.get("feedback_id"))


@router.get("/stats")
async def get_stats(
    request: Request,
    days: int = 7,
    email: str = Depends(get_current_operator)
):
    """Get feedback statistics for the current user."""
    db = request.app.state.db
    collector = get_feedback_collector(db)
    return await collector.get_feedback_stats(email, days)


@router.get("/insights")
async def get_insights(
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Get learning insights based on feedback patterns."""
    db = request.app.state.db
    collector = get_feedback_collector(db)
    return await collector.get_learning_insights(email)


@router.post("/adapt")
async def trigger_adaptation(
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Trigger automatic prompt adaptation based on recent feedback."""
    db = request.app.state.db
    collector = get_feedback_collector(db)
    result = await collector.auto_adapt(email)
    return result


@router.post("/prompt-adaptation")
async def add_prompt_adaptation(
    req: PromptAdaptationRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Manually add a prompt adaptation rule."""
    db = request.app.state.db
    collector = get_feedback_collector(db)
    await collector.update_prompt_adaptation(email, req.prompt_type, req.addition)
    return {"status": "ok"}


@router.get("/adapted-prompt")
async def get_adapted_prompt(
    prompt_type: str = "chat",
    request: Request = None,
    email: str = Depends(get_current_operator)
):
    """Get the adapted system prompt for the current user."""
    db = request.app.state.db
    collector = get_feedback_collector(db)
    prompt = await collector.get_adapted_prompt(email, prompt_type)
    return {"prompt": prompt, "prompt_type": prompt_type}
