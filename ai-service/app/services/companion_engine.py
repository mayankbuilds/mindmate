import os
import re
import logging
from typing import List, Dict, Any, Optional
from app.core.llm import (
    get_llm_client_and_model,
    record_llm_success,
    record_llm_error,
    classify_llm_error,
    sanitize_message,
)
from app.schemas.chat import StudentContext, ChatMessage

logger = logging.getLogger(__name__)

CALMFLOW_SYSTEM_PROMPT = """You are "CalmFlow", an empathetic, grounded, and supportive wellness companion inside a Stress Prediction and Tracking platform.

Context Provided:
- User's Predicted Stress Level: {{STRESS_LEVEL}}
- User's Assessment Score: {{STRESS_SCORE}}

Your Core Responsibilities:
1. Tone & Empathy: Speak warmly, calmly, and attentively. Acknowledge the user's stress level gently without making them feel pathologized or overly worried.
2. Brevity: Stressed users get overwhelmed easily. Keep responses concise (under 2-3 short paragraphs or 80-100 words max). Never send walls of text.
3. Grounding Interventions: When stress is high, offer one simple, actionable grounding exercise (e.g., 4-7-8 breathing, box breathing, or 5-4-3-2-1 sensory grounding). Suggest just ONE step at a time.
4. Boundaries & Safety:
   - You are NOT a doctor, psychiatrist, or licensed medical professional.
   - Never diagnose, prescribe medications, or claim clinical certainty.
   - If the user expresses thoughts of self-harm, severe crisis, or hopelessness, immediately stop conversational banter, express warm concern, and provide verified crisis hotline information (e.g., Tele-MANAS: 14416 / 1800-891-4416 or KIRAN: 1800-599-0019 in India, or 988 in the US/Global emergency lines)."""


import re

def _matches_any(patterns: List[str], text: str) -> bool:
    for p in patterns:
        if re.search(p, text, re.IGNORECASE):
            return True
    return False


def fallback_reply(user_message: str, stress_level: str = "Moderate", context: Optional[StudentContext] = None) -> str:
    """
    Rich, intent-aware, and student-contextual offline fallback support.
    Provides diverse, empathetic, practical responses across common conversational
    and wellness intents when an external LLM is not configured or reachable.
    """
    t = (user_message or "").strip()

    # 1. Immediate Crisis Detection & Verification
    if _matches_any([r"kill\s+myself", r"suicide", r"end\s+my\s+life", r"harm\s+myself", r"want\s+to\s+die", r"\bhopeless\b"], t):
        return (
            "I hear how much pain you are carrying right now, but please know you do not have to carry it alone. "
            "Please connect with caring, professional support right now:\n\n"
            "- India: Tele-MANAS at 14416 / 1800-891-4416 or KIRAN at 1800-599-0019\n"
            "- US / Canada: Call or text 988 Suicide & Crisis Lifeline\n"
            "- Or tap the red SOS button in this app to alert your emergency contacts."
        )

    # 2. Academic Pressures, Exams & Deadlines
    if _matches_any([r"\b(study\w*|exam\w*|test\w*|assignment\w*|deadline\w*|homework|procrastinat\w*|grades?|quiz\w*)\b"], t):
        days_note = f" (your exam is in {context.exam} days)" if context and context.exam is not None else ""
        return (
            f"Academic pressure can feel intense{days_note}. The secret to getting through is chunking: "
            "pick just ONE small, 20-minute focus block, and give yourself full permission to ignore the rest for now. "
            "What is the single most urgent task on your plate today?"
        )

    # 3. Sleep & Nighttime Rest
    if _matches_any([r"\b(sleep\w*|insomnia|can't\s+sleep|awake|nightmare\w*|bedtime|restless\w*)\b"], t):
        return (
            "When sleep is disrupted, everything feels heavier the next day. Tonight, try setting your phone "
            "across the room 30 minutes before bed and taking five slow, deep breaths in the dark. "
            "Are you having trouble falling asleep, or waking up in the middle of the night?"
        )

    # 4. Breathing & Immediate Relaxation
    if _matches_any([r"\b(breath|breathe|breathing|relax|chill|unwind|meditat\w*)\b", r"\bcalm\b"], t):
        return (
            "Let's take a slow reset breath together right now:\n\n"
            "1. Breathe in gently through your nose for 4 counts...\n"
            "2. Hold softly for 4 counts...\n"
            "3. Exhale slowly and completely through your mouth for 6 counts.\n\n"
            "Let your shoulders drop down as you exhale. How does your chest feel right now?"
        )

    # 5. Anxiety, Panic & Overwhelm
    if _matches_any([r"\b(stress\w*|anxious\w*|anxiety|panic|overwhelm\w*|nervous\w*|worry\w*|racing|scared|fear)\b"], t):
        return (
            f"I hear you, and those feelings are completely valid with your stress level being {stress_level.lower()}. "
            "Let's ground right now using the 3-3-3 check: name 3 things you can see around you, "
            "3 sounds you can hear, and move 3 parts of your body (like your fingers, toes, and shoulders). "
            "What is one object you see right now?"
        )

    # 6. Fatigue, Exhaustion & Burnout
    if _matches_any([r"\b(tired|exhaust\w*|burnout|burnt\s+out|drained|sleepy|fatigue)\b", r"no\s+energy"], t):
        sleep_ctx = f" (you logged {context.sleep}h of sleep)" if context and context.sleep is not None else ""
        return (
            f"It sounds like your mind and body are asking for genuine rest{sleep_ctx}. "
            "When we are running on empty, everyday tasks become much heavier. Can you step away from screens "
            "and take a 10-minute quiet pause right now? What is the single most restful thing you could do today?"
        )

    # 7. Sadness, Loneliness & Low Mood
    if _matches_any([r"\b(sad\w*|unhappy|cry|crying|lonely|alone|depress\w*|blue|heartbroken)\b"], t):
        return (
            "I'm really sorry things feel heavy and lonely right now. It is completely okay to feel sad, "
            "and you don't have to force yourself to feel positive right away. Would you like to talk about "
            "what brought this on, or would you prefer a gentle breathing pause together?"
        )

    # 8. Gratitude & Politeness
    if _matches_any([r"\b(thank\w*|appreciat\w*|helpful|cheers)\b", r"good\s+to\s+know"], t):
        return (
            "You are very welcome. Remember to give yourself credit for checking in on your well-being today. "
            "I'm always right here whenever you need a quick breather or someone to talk through your day with."
        )

    # 9. Greetings & Salutations
    if _matches_any([r"\b(hello|hi|hey|howdy|sup)\b", r"good\s+morning", r"good\s+evening", r"good\s+afternoon"], t):
        greeting = "Hello! I'm here and glad you reached out. "
        if context and context.exam is not None and context.exam <= 7:
            greeting += f"I see your exam is coming up in {context.exam} days. "
        return (
            greeting +
            "How has your day been going so far? Tell me what's on your mind, and we can take it one calm step at a time."
        )

    # 10. General Guidance & Advice
    if _matches_any([r"\b(advice|tips?|guide\w*)\b", r"what\s+should\s+i\s+do", r"what\s+to\s+do", r"\bhelp\b"], t):
        return (
            "Here is a great student wellness starting point: drink a tall glass of water, stand up to stretch "
            "your back, and give yourself a 5-minute break from coursework. What area feels like it needs the most "
            "attention today: your sleep, study routine, or taking time to unwind?"
        )

    # 11. Contextual Default Fall-through
    if context and context.sleep is not None and context.sleep < 6:
        return (
            f"Thank you for sharing that with me. I noticed you logged {context.sleep} hours of sleep today. "
            "Short sleep can amplify everything we feel. How are your energy levels holding up right now?"
        )

    return (
        "Thank you for sharing that with me. I'm here and listening with care. Tell me a little more about "
        "what's going on, and we will take it one calm step at a time."
    )



def format_fallback_message(text: str) -> str:
    """Prepend an explicit offline support indicator so templates are never misrepresented as AI-generated."""
    return f"[Offline Support Guide]\n\n{text}"


def generate_companion_reply(messages: List[ChatMessage], context: Optional[StudentContext] = None) -> Dict[str, Any]:
    """
    Main companion dispatch:
    - Attempts live LLM invocation (Groq or Gemini via OpenAI client).
    - If unconfigured, times out, or errors, provides an explicitly labelled offline fallback.
    """
    stress_level = "Moderate"
    stress_score = "Not assessed yet"

    if context:
        if context.level:
            stress_level = str(context.level)
        if context.score is not None:
            stress_score = f"{context.score}/100"

    system_instruction = CALMFLOW_SYSTEM_PROMPT.replace(
        "{{STRESS_LEVEL}}", stress_level
    ).replace("{{STRESS_SCORE}}", stress_score)

    if context and (context.sleep or context.study or context.screen or context.exam):
        details = []
        if context.sleep is not None:
            details.append(f"Sleep: {context.sleep}h")
        if context.study is not None:
            details.append(f"Study: {context.study}h")
        if context.screen is not None:
            details.append(f"Screen: {context.screen}h")
        if context.exam is not None:
            details.append(f"Exam in: {context.exam} days")
        if details:
            system_instruction += f"\nAdditional Context: {', '.join(details)}"

    formatted_messages = [{"role": "system", "content": system_instruction}]
    for msg in messages:
        formatted_messages.append({"role": msg.role, "content": msg.content})

    last_user_msg = ""
    for m in reversed(messages):
        if m.role == "user":
            last_user_msg = m.content
            break

    try:
        client, model_name, provider_name = get_llm_client_and_model()
        if not client or not model_name:
            # Explicitly labelled fallback when no provider credentials exist
            raw_fallback = fallback_reply(last_user_msg, stress_level, context)
            return {
                "reply": format_fallback_message(raw_fallback),
                "source": "fallback",
                "is_fallback": True,
                "provider": "offline-guide",
                "error_type": "unconfigured_missing_key",
                "error_message": "LLM client not configured or missing API credentials",
            }

        llm_timeout = float(os.getenv("AI_TIMEOUT_SECONDS", "12.0"))

        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=formatted_messages,
                max_tokens=250,
                temperature=0.7,
                timeout=llm_timeout,
            )
        except Exception as primary_err:
            classified = classify_llm_error(primary_err)
            # If the specific model is not found on Google AI Studio, try resilient fallback to gemini-1.5-flash
            if provider_name == "gemini" and classified == "model_not_found" and model_name != "gemini-1.5-flash":
                logger.info(
                    f"[CompanionEngine] Model '{model_name}' was not found. Attempting resilient fallback to 'gemini-1.5-flash'..."
                )
                try:
                    response = client.chat.completions.create(
                        model="gemini-1.5-flash",
                        messages=formatted_messages,
                        max_tokens=250,
                        temperature=0.7,
                        timeout=llm_timeout,
                    )
                    model_name = "gemini-1.5-flash"
                except Exception:
                    raise primary_err
            else:
                raise primary_err

        reply = response.choices[0].message.content
        if not reply or not reply.strip():
            raise ValueError("Empty response received from LLM provider")

        record_llm_success(provider_name or "llm", model_name or "")
        return {
            "reply": reply.strip(),
            "source": provider_name or "llm",
            "is_fallback": False,
            "provider": provider_name or "llm",
        }
    except Exception as e:
        error_type = classify_llm_error(e)
        sanitized_err = sanitize_message(f"{type(e).__name__}: {str(e)}")
        record_llm_error(sanitized_err, error_type=error_type)
        logger.warning(
            f"[CompanionEngine] LLM request failed ({error_type}): {sanitized_err}. Using offline fallback."
        )
        raw_fallback = fallback_reply(last_user_msg, stress_level, context)
        return {
            "reply": format_fallback_message(raw_fallback),
            "source": "fallback",
            "is_fallback": True,
            "provider": "offline-guide",
            "error_type": error_type,
            "error_message": sanitized_err,
        }