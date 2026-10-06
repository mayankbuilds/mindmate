from app.core.llm import get_llm_client_and_model
from app.schemas.chat import StudentContext, ChatMessage
from typing import List

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


def fallback_reply(user_message: str, stress_level: str = "Moderate") -> str:
    t = (user_message or "").lower()

    # Crisis detection & immediate safety hotline routing
    if any(k in t for k in ["kill myself", "suicide", "end my life", "harm myself", "want to die", "hopeless"]):
        return (
            "I'm so sorry that you are feeling this much pain right now, but please know you do not have to carry it alone. "
            "Please reach out to professional support right now:\n\n"
            "- India: Tele-MANAS at 14416 / 1800-891-4416 or KIRAN at 1800-599-0019\n"
            "- US / Canada: Call or text 988 Suicide & Crisis Lifeline\n"
            "- You can also use the red SOS button in this app to alert your saved emergency contacts."
        )

    if "breath" in t:
        return (
            "Let's try a simple reset together. Breathe in through your nose for 4 counts, hold gently for 4, "
            "then breathe out slowly for 6. Let your shoulders drop as you release. How does your chest feel now?"
        )

    if "sleep" in t:
        return (
            "When sleep is disrupted, everyday tasks feel much heavier. Tonight, try putting your phone across the room "
            "30 minutes before sleep and take 5 slow breaths in the dark. Are you having trouble falling asleep or waking up early?"
        )

    if "study" in t or "overwhelm" in t or "exam" in t:
        return (
            "That is a lot to carry on your mind. Let's break it down into just one 20-minute focus block, and set aside "
            "the rest for now. What is the single most urgent topic on your plate today?"
        )

    if "stress" in t or "anxious" in t or "panic" in t:
        return (
            f"I hear you, and it is completely understandable to feel that way with your stress level being {stress_level.lower()}. "
            "Would you like to try a quick 2-minute breathing exercise together, or talk through what is feeling heaviest?"
        )

    return (
        "Thank you for sharing that with me. I'm here and listening with care. Tell me a little more about "
        "what's going on, and we will take it one calm step at a time."
    )


def generate_companion_reply(messages: List[ChatMessage], context: StudentContext = None) -> str:
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

    # Context details if available
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
        client, model_name = get_llm_client_and_model()
        if not client or not model_name:
            # Missing or unconfigured API key -> Seamless fallback
            return fallback_reply(last_user_msg, stress_level)

        response = client.chat.completions.create(
            model=model_name,
            messages=formatted_messages,
            max_tokens=250,
            temperature=0.7,
        )
        reply = response.choices[0].message.content
        if not reply:
            raise ValueError("Empty response received")
        return reply.strip()
    except Exception as e:
        # On any API error (network timeout, rate limit, invalid key), seamlessly fall back
        return fallback_reply(last_user_msg, stress_level)