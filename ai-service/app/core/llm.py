from openai import OpenAI
from app.core.config import settings

client = OpenAI(
    base_url=settings.AI_BASE_URL,
    api_key=settings.AI_API_KEY,
)


def get_llm_client() -> OpenAI:
    return client