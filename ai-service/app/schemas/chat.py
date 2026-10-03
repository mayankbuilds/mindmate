from pydantic import BaseModel
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


class StudentContext(BaseModel):
    level: str
    sleep: float
    study: float
    screen: float
    exam: int


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[StudentContext] = None


class ChatResponse(BaseModel):
    reply: str