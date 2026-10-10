from fastapi import APIRouter
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.companion_engine import generate_companion_reply

router = APIRouter(prefix="/chat", tags=["AI Companion"])


@router.post("/message", response_model=ChatResponse)
def chat_message(payload: ChatRequest):
    result = generate_companion_reply(messages=payload.messages, context=payload.context)
    if isinstance(result, dict):
        return ChatResponse(
            reply=result["reply"],
            source=result.get("source", "llm"),
            is_fallback=result.get("is_fallback", False),
            provider=result.get("provider"),
        )
    return ChatResponse(reply=str(result))