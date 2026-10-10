import os
import re
import logging
from typing import Tuple, Optional, Dict, Any
from openai import OpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory runtime health monitor
_provider_status: Dict[str, Any] = {
    "status": "unconfigured",
    "error_type": None,
    "last_error": None,
    "last_success": None,
}

# Regex to safely redact common API key patterns without leaking secrets
API_KEY_REGEX = re.compile(r"(AIza[0-9A-Za-z-_]{35}|gsk_[0-9A-Za-z]{30,}|sk-[0-9A-Za-z]{30,})")


def clean_api_key(raw: Optional[str]) -> str:
    """Strips quotes, brackets, and whitespace users may paste on hosting platforms like Render."""
    if not raw or not isinstance(raw, str):
        return ""
    return raw.strip("'\" \t\r\n<>")


def normalize_base_url(url: Optional[str]) -> str:
    trimmed = (url or "").strip()
    if trimmed and not trimmed.endswith("/"):
        return trimmed + "/"
    return trimmed


def sanitize_message(msg: str) -> str:
    """Removes any API keys or tokens from string to avoid accidental logging or leaks."""
    clean_msg = str(msg)
    keys_to_redact = [
        clean_api_key(os.getenv("GEMINI_API_KEY")),
        clean_api_key(os.getenv("AI_API_KEY")),
        clean_api_key(getattr(settings, "GEMINI_API_KEY", "")),
        clean_api_key(getattr(settings, "AI_API_KEY", "")),
    ]
    for key in keys_to_redact:
        if key and len(key) > 5 and not key.startswith("your_"):
            clean_msg = clean_msg.replace(key, "[REDACTED_API_KEY]")
    # Regex fallback to redact any recognized token pattern
    clean_msg = API_KEY_REGEX.sub("[REDACTED_API_KEY]", clean_msg)
    return clean_msg


def classify_llm_error(error: Exception) -> str:
    """
    Distinguishes connection errors, cold-start timeouts, authentication errors,
    model-not-found errors, and quota errors.
    """
    err_str = str(error).lower()
    err_type_name = type(error).__name__.lower()
    status_code = getattr(error, "status_code", None)
    if status_code is None and hasattr(error, "response"):
        status_code = getattr(error.response, "status_code", None)

    # 1. Authentication errors (401, 403, or 400 with API key invalidation)
    if status_code in (401, 403) or "unauthorized" in err_str or "forbidden" in err_str or "permission" in err_str:
        return "authentication_error"
    if "api key" in err_str or "api_key" in err_str or "valid api key" in err_str:
        return "authentication_error"

    # 2. Model Not Found (404)
    if status_code == 404 or "model_not_found" in err_str or "not found" in err_str or "does not exist" in err_str:
        return "model_not_found"

    # 3. Quota / Rate Limit Exceeded (429)
    if status_code == 429 or "rate_limit" in err_str or "quota" in err_str or "resource_exhausted" in err_str:
        return "quota_exceeded"

    # 4. Timeout errors
    if "timeout" in err_str or "timed out" in err_str or "timeout" in err_type_name:
        return "timeout"

    # 5. Connection errors
    if (
        "connection" in err_str
        or "connect" in err_type_name
        or "connectionrefused" in err_str
        or "nameresolution" in err_str
        or "gaierror" in err_str
    ):
        return "connection_error"

    # 6. Upstream 5xx errors
    if status_code and status_code >= 500:
        return "upstream_service_error"

    return "unexpected_error"


def record_llm_success(provider: str, model: str):
    """Called when an LLM request succeeds to mark provider as genuinely operational."""
    _provider_status["status"] = "operational"
    _provider_status["error_type"] = None
    _provider_status["last_error"] = None
    _provider_status["last_success"] = {"provider": provider, "model": model}


def record_llm_error(error_msg: str, error_type: Optional[str] = None):
    """Called when an LLM request fails to update runtime state safely without leaking credentials."""
    _provider_status["status"] = "error"
    _provider_status["error_type"] = error_type or "unexpected_error"
    _provider_status["last_error"] = sanitize_message(error_msg)


def is_valid_gemini_key(key: str) -> bool:
    if not key or not isinstance(key, str):
        return False
    k = clean_api_key(key)
    if len(k) < 16:
        return False
    if k.startswith("your_") or k.startswith("<") or k in ("mock-key", "placeholder", "dummy"):
        return False
    return True


def is_valid_groq_key(key: str) -> bool:
    if not key or not isinstance(key, str):
        return False
    k = clean_api_key(key)
    if len(k) < 16:
        return False
    if k.startswith("gsk_your_") or k.startswith("<") or k in ("mock-key", "placeholder", "dummy"):
        return False
    return True


def get_llm_client_and_model() -> Tuple[Optional[OpenAI], Optional[str], Optional[str]]:
    """
    Dynamically initializes the LLM client based on environment configuration.
    Primary provider: Google Gemini (via Google AI Studio OpenAI-compatible endpoint).
    Secondary provider: Groq.
    Reads provider and model name strictly from environment configuration without hardcoding.
    Returns (client, model_name, provider_name).
    """
    provider = (os.getenv("AI_PROVIDER") or settings.AI_PROVIDER or "gemini").strip().lower()
    model = (os.getenv("AI_MODEL") or settings.AI_MODEL or "gemini-3.5-flash-lite").strip()

    # 1. Primary: Google Gemini
    if provider == "gemini":
        gemini_key = clean_api_key(os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY or "")
        if is_valid_gemini_key(gemini_key):
            try:
                base_url = normalize_base_url(
                    os.getenv("AI_BASE_URL")
                    or settings.AI_BASE_URL
                    or "https://generativelanguage.googleapis.com/v1beta/openai/"
                )
                client = OpenAI(base_url=base_url, api_key=gemini_key)
                return client, model, "gemini"
            except Exception as e:
                err_type = classify_llm_error(e)
                err_msg = sanitize_message(str(e))
                logger.warning(f"[LLM Client] Failed to initialize Gemini OpenAI client ({err_type}): {err_msg}")
                record_llm_error(err_msg, error_type=err_type)

    # 2. Secondary: Groq / OpenAI compatible
    if provider == "groq" or (provider == "gemini" and not is_valid_gemini_key(os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY or "")):
        api_key = clean_api_key(os.getenv("AI_API_KEY") or settings.AI_API_KEY or "")
        if is_valid_groq_key(api_key):
            try:
                groq_base_url = normalize_base_url(os.getenv("AI_BASE_URL") or "https://api.groq.com/openai/v1/")
                groq_model = (os.getenv("AI_MODEL") or "llama-3.1-8b-instant").strip()
                client = OpenAI(base_url=groq_base_url, api_key=api_key)
                return client, groq_model, "groq"
            except Exception as e:
                err_type = classify_llm_error(e)
                err_msg = sanitize_message(str(e))
                logger.warning(f"[LLM Client] Failed to initialize Groq client ({err_type}): {err_msg}")
                record_llm_error(err_msg, error_type=err_type)

    return None, None, None


def reset_llm_status():
    """Reset in-memory status (primarily for clean testing)."""
    _provider_status["status"] = "unconfigured"
    _provider_status["error_type"] = None
    _provider_status["last_error"] = None
    _provider_status["last_success"] = None


def check_llm_health() -> Dict[str, Any]:
    """
    Inspects provider configuration and operational status.
    Guarantees: Does NOT report Gemini as operational merely because a key exists.
    llm_ready is ONLY True once a real LLM request has succeeded.
    """
    provider = (os.getenv("AI_PROVIDER") or settings.AI_PROVIDER or "gemini").strip().lower()
    model = (os.getenv("AI_MODEL") or settings.AI_MODEL or "gemini-3.5-flash-lite").strip()

    gemini_key = clean_api_key(os.getenv("GEMINI_API_KEY") or settings.GEMINI_API_KEY or "")
    gemini_valid = is_valid_gemini_key(gemini_key)

    groq_key = clean_api_key(os.getenv("AI_API_KEY") or settings.AI_API_KEY or "")
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
                "error_type": None,
                "last_error": None,
            }

        if current_status == "operational":
            succ = _provider_status.get("last_success") or {}
            return {
                "configured_provider": "gemini",
                "configured_model": model,
                "active_provider": succ.get("provider", "gemini"),
                "active_model": succ.get("model", model),
                "llm_ready": True,
                "llm_status": "operational",
                "error_type": None,
                "last_error": None,
            }
        elif current_status == "error":
            return {
                "configured_provider": "gemini",
                "configured_model": model,
                "active_provider": "offline-guide",
                "active_model": None,
                "llm_ready": False,
                "llm_status": "error",
                "error_type": _provider_status.get("error_type"),
                "last_error": _provider_status.get("last_error"),
            }
        else:
            return {
                "configured_provider": "gemini",
                "configured_model": model,
                "active_provider": "offline-guide",
                "active_model": None,
                "llm_ready": False,
                "llm_status": "configured_unverified",
                "error_type": None,
                "last_error": None,
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
                "error_type": None,
                "last_error": None,
            }

        if current_status == "operational":
            succ = _provider_status.get("last_success") or {}
            return {
                "configured_provider": "groq",
                "configured_model": model,
                "active_provider": succ.get("provider", "groq"),
                "active_model": succ.get("model", model),
                "llm_ready": True,
                "llm_status": "operational",
                "error_type": None,
                "last_error": None,
            }
        elif current_status == "error":
            return {
                "configured_provider": "groq",
                "configured_model": model,
                "active_provider": "offline-guide",
                "active_model": None,
                "llm_ready": False,
                "llm_status": "error",
                "error_type": _provider_status.get("error_type"),
                "last_error": _provider_status.get("last_error"),
            }
        else:
            return {
                "configured_provider": "groq",
                "configured_model": model,
                "active_provider": "offline-guide",
                "active_model": None,
                "llm_ready": False,
                "llm_status": "configured_unverified",
                "error_type": None,
                "last_error": None,
            }

    return {
        "configured_provider": provider,
        "configured_model": model,
        "active_provider": "offline-guide",
        "active_model": None,
        "llm_ready": False,
        "llm_status": "unconfigured",
        "error_type": None,
        "last_error": None,
    }