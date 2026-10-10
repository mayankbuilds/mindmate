import os
import logging
from typing import Tuple, Optional, Dict, Any
from openai import OpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory runtime health monitor
_provider_status: Dict[str, Any] = {
    "status": "unconfigured",
    "last_error": None,
    "last_success": None,
}


def sanitize_message(msg: str) -> str:
    """Removes any API keys or tokens from string to avoid accidental logging or leaks."""
    clean_msg = str(msg)
    keys_to_redact = [
        os.getenv("GEMINI_API_KEY"),
        os.getenv("AI_API_KEY"),
        getattr(settings, "GEMINI_API_KEY", ""),
        getattr(settings, "AI_API_KEY", ""),
    ]
    for key in keys_to_redact:
        if key and len(key) > 5 and not key.startswith("your_"):
            clean_msg = clean_msg.replace(key, "[REDACTED_API_KEY]")
    return clean_msg


def record_llm_success(provider: str, model: str):
    """Called when an LLM request succeeds to mark provider as genuinely operational."""
    _provider_status["status"] = "operational"
    _provider_status["last_error"] = None
    _provider_status["last_success"] = {"provider": provider, "model": model}


def record_llm_error(error_msg: str):
    """Called when an LLM request fails to update runtime state safely without leaking credentials."""
    _provider_status["status"] = "error"
    _provider_status["last_error"] = sanitize_message(error_msg)


def is_valid_gemini_key(key: str) -> bool:
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    return len(k) >= 16 and not k.startswith("your_") and k != "mock-key"


def is_valid_groq_key(key: str) -> bool:
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    return len(k) >= 16 and not k.startswith("gsk_your_") and k != "mock-key"


def get_llm_client_and_model() -> Tuple[Optional[OpenAI], Optional[str], Optional[str]]:
    """
    Dynamically initializes the LLM client based on environment configuration.
    Primary provider: Google Gemini (via Google AI Studio OpenAI-compatible endpoint).
    Secondary provider: Groq.
    Reads provider and model name strictly from environment configuration without hardcoding.
    Returns (client, model_name, provider_name).
    """
    provider = (os.getenv("AI_PROVIDER") or settings.AI_PROVIDER or "gemini").strip().lower()
    model = (os.getenv("AI_MODEL") or settings.AI_MODEL or "gemini-2.5-flash-lite").strip()

    # 1. Primary: Google Gemini
    if provider == "gemini":
        gemini_key = (os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY or "").strip()
        if is_valid_gemini_key(gemini_key):
            try:
                base_url = (
                    os.getenv("AI_BASE_URL")
                    or settings.AI_BASE_URL
                    or "https://generativelanguage.googleapis.com/v1beta/openai/"
                ).strip()
                client = OpenAI(base_url=base_url, api_key=gemini_key)
                return client, model, "gemini"
            except Exception as e:
                err_msg = sanitize_message(str(e))
                logger.warning(f"[LLM Client] Failed to initialize Gemini OpenAI client: {err_msg}")
                record_llm_error(err_msg)

    # 2. Secondary: Groq / OpenAI compatible
    if provider == "groq" or (provider == "gemini" and not is_valid_gemini_key(os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY or "")):
        api_key = (os.getenv("AI_API_KEY") or settings.AI_API_KEY or "").strip()
        if is_valid_groq_key(api_key):
            try:
                groq_base_url = os.getenv("AI_BASE_URL") or "https://api.groq.com/openai/v1"
                groq_model = os.getenv("AI_MODEL") or "llama-3.1-8b-instant"
                client = OpenAI(base_url=groq_base_url, api_key=api_key)
                return client, groq_model, "groq"
            except Exception as e:
                err_msg = sanitize_message(str(e))
                logger.warning(f"[LLM Client] Failed to initialize Groq client: {err_msg}")
                record_llm_error(err_msg)

    return None, None, None


def reset_llm_status():
    """Reset in-memory status (primarily for clean testing)."""
    _provider_status["status"] = "unconfigured"
    _provider_status["last_error"] = None
    _provider_status["last_success"] = None


def check_llm_health() -> Dict[str, Any]:
    """
    Inspects provider configuration and operational status.
    Guarantees: Does NOT report Gemini as operational merely because a key exists.
    """
    provider = (os.getenv("AI_PROVIDER") or settings.AI_PROVIDER or "gemini").strip().lower()
    model = (os.getenv("AI_MODEL") or settings.AI_MODEL or "gemini-2.5-flash-lite").strip()

    gemini_key = (os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY or "").strip()
    gemini_valid = is_valid_gemini_key(gemini_key)

    groq_key = (os.getenv("AI_API_KEY") or settings.AI_API_KEY or "").strip()
    groq_valid = is_valid_groq_key(groq_key)

    current_status = _provider_status["status"]

    if provider == "gemini":
        if not gemini_valid:
            return {
                "configured_provider": "gemini",
                "configured_model": model,
                "active_provider": "offline-guide",
                "active_model": None,
                "llm_ready": False,
                "llm_status": "unconfigured_missing_key",
                "last_error": None,
            }
        ready = current_status != "error"
        status_label = current_status if current_status != "unconfigured" else "configured"
        return {
            "configured_provider": "gemini",
            "configured_model": model,
            "active_provider": "gemini",
            "active_model": model,
            "llm_ready": ready,
            "llm_status": status_label,
            "last_error": _provider_status["last_error"],
        }

    if provider == "groq":
        if not groq_valid:
            return {
                "configured_provider": "groq",
                "configured_model": model,
                "active_provider": "offline-guide",
                "active_model": None,
                "llm_ready": False,
                "llm_status": "unconfigured_missing_key",
                "last_error": None,
            }
        ready = current_status != "error"
        status_label = current_status if current_status != "unconfigured" else "configured"
        return {
            "configured_provider": "groq",
            "configured_model": model,
            "active_provider": "groq",
            "active_model": model,
            "llm_ready": ready,
            "llm_status": status_label,
            "last_error": _provider_status["last_error"],
        }

    return {
        "configured_provider": provider,
        "configured_model": model,
        "active_provider": "offline-guide",
        "active_model": None,
        "llm_ready": False,
        "llm_status": "unconfigured",
        "last_error": None,
    }