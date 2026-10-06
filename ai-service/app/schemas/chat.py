from pydantic import BaseModel
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


class StudentContext(BaseModel):
    level: Optional[str] = "Moderate"
    score: Optional[float] = None
    sleep: Optional[float] = None
    study: Optional[float] = None
    screen: Optional[float] = None
    exam: Optional[int] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[StudentContext] = None


class ChatResponse(BaseModel):
    reply: str