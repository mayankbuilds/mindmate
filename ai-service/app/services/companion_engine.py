from app.core.llm import get_llm_client
from app.core.config import settings
from app.schemas.chat import StudentContext, ChatMessage
from typing import List

SYSTEM_PROMPT = (
    "You are MindMate AI, a warm, supportive wellness companion for university students. "
    "Talk like a kind, thoughtful friend: short replies (2-4 sentences), natural language, "
    "no bullet lists unless giving a breathing exercise. Validate feelings first, then offer one gentle, "
    "practical idea. Ask at most one question. You are not a therapist: never diagnose. "
    "If a student mentions self-harm, hopelessness, or being in danger, respond with care, encourage them to "
    "reach out to a trusted person or local emergency services right now, and mention the SOS button in the app."
)


def fallback_reply(user_message: str) -> str:
    t = user_message.lower()
    if "breath" in t:
        return (
            "Let's try this together. Breathe in through your nose for 4 counts, hold for 4, "
            "then breathe out slowly for 6. Repeat that four times, and let your shoulders drop as you exhale. "
            "How do you feel afterwards?"
        )
    if "sleep" in t:
        return (
            "Poor sleep makes everything feel heavier. Tonight, try dimming the lights and putting your phone "
            "away 30 minutes before bed. Do you usually get stuck falling asleep, or waking up in the night?"
        )
    if "study" in t or "overwhelm" in t:
        return (
            "That's a lot to carry. Pick just one small thing to start with, set a timer for 25 minutes, "
            "and leave the rest for later. What's the one topic that feels most urgent?"
        )
    if "stress" in t:
        return (
            "I'm glad you told me. Stress builds up quietly, and naming it is a good first step. "
            "Want to unpack what's weighing on you most, or would a quick breathing exercise help first?"
        )
    return (
        "Thanks for sharing that with me. I'm here and listening. Tell me a little more about what's on your mind, "
        "and we'll take it one step at a time."
    )


def generate_companion_reply(messages: List[ChatMessage], context: StudentContext = None) -> str:
    ctx_text = ""
    if context:
        ctx_text = (
            f"\n\nToday's context: stress level {context.level}, slept {context.sleep}h, "
            f"studied {context.study}h, screen {context.screen}h, exam in {context.exam} days."
        )

    system_instruction = f"{SYSTEM_PROMPT}{ctx_text}"

    formatted_messages = [{"role": "system", "content": system_instruction}]
    for msg in messages:
        formatted_messages.append({"role": msg.role, "content": msg.content})

    try:
        client = get_llm_client()
        response = client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=formatted_messages,
            max_tokens=300,
            temperature=0.7,
        )
        reply = response.choices[0].message.content
        if not reply:
            raise ValueError("Empty response received")
        return reply.strip()
    except Exception as e:
        last_user_msg = ""
        for m in reversed(messages):
            if m.role == "user":
                last_user_msg = m.content
                break
        return fallback_reply(last_user_msg)