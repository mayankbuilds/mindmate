import os
from openai import OpenAI
from app.core.config import settings


def get_llm_client_and_model():
    """
    Checks if GEMINI_API_KEY or AI_API_KEY is present and functional.
    Returns (client, model_name). If no valid key is provided, returns (None, None).
    """
    gemini_key = os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY
    if gemini_key and len(gemini_key.strip()) > 8 and not gemini_key.startswith("your_"):
        client = OpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=gemini_key.strip(),
        )
        return client, "gemini-1.5-flash"

    api_key = os.getenv("AI_API_KEY") or settings.AI_API_KEY
    if (
        api_key
        and len(api_key.strip()) > 8
        and not api_key.startswith("gsk_your_")
        and api_key != "mock-key"
    ):
        client = OpenAI(
            base_url=settings.AI_BASE_URL,
            api_key=api_key.strip(),
        )
        return client, settings.AI_MODEL

    return None, None