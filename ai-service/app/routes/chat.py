from fastapi import APIRouter
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.companion_engine import generate_companion_reply

router = APIRouter(prefix="/chat", tags=["AI Companion"])


@router.post("/message", response_model=ChatResponse)
def chat_message(payload: ChatRequest):
    reply = generate_companion_reply(messages=payload.messages, context=payload.context)
    return ChatResponse(reply=reply)