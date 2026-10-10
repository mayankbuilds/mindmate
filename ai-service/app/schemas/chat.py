from pydantic import BaseModel
from typing import List, Optional, Dict


class ChatMessage(BaseModel):
    role: str
    content: str


class StudentContext(BaseModel):
    # ML Assessment Context (from trained 7-feature Random Forest questionnaire model)
    predicted_class: Optional[str] = None
    probabilities: Optional[Dict[str, float]] = None
    assessed_at: Optional[str] = None

    # Rule-Based Lifestyle Habit Tracking (deterministic heuristic index 0–100, NOT ML)
    lifestyle_score: Optional[float] = None
    lifestyle_level: Optional[str] = None

    # Daily Check-In Context
    sleep: Optional[float] = None
    study: Optional[float] = None
    screen: Optional[float] = None
    exam: Optional[int] = None
    mood: Optional[str] = None
    note: Optional[str] = None
    has_logged_today: Optional[bool] = None

    # Backward-compatible fields
    level: Optional[str] = "Moderate"
    score: Optional[float] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[StudentContext] = None


class ChatResponse(BaseModel):
    reply: str
    source: str = "llm"
    is_fallback: bool = False
    provider: Optional[str] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None