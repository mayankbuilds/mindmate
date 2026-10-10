import os
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.companion_engine import fallback_reply, format_fallback_message, generate_companion_reply
from app.schemas.chat import ChatMessage, StudentContext
from app.core.llm import get_llm_client_and_model, check_llm_health, sanitize_message, reset_llm_status

client = TestClient(app)


def test_companion_offline_fallback_when_no_credentials():
    """
    Verifies that when no valid LLM keys are present, POST /chat/message:
    1. Returns HTTP 200 without crashing
    2. Explicitly flags is_fallback = True
    3. Identifies provider as offline-guide
    4. Prepends the [Offline Support Guide] banner
    """
    with patch("app.services.companion_engine.get_llm_client_and_model", return_value=(None, None, None)):
        payload = {
            "messages": [
                {"role": "user", "content": "Hello, how are you today?"}
            ],
            "context": {"level": "Low", "score": 25}
        }
        response = client.post("/chat/message", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["is_fallback"] is True
        assert data["source"] == "fallback"
        assert data["provider"] == "offline-guide"
        assert data["reply"].startswith("[Offline Support Guide]")
        assert "Hello!" in data["reply"]


def test_fallback_intents_produce_distinct_responses():
    """
    Verifies that different user messages receive distinct, relevant intent responses
    rather than repeating a single static template.
    """
    prompts = {
        "greeting": "Hello there",
        "gratitude": "Thank you so much for the advice",
        "sadness": "I feel so lonely and sad today",
        "fatigue": "I'm exhausted and completely burnt out",
        "breathing": "Can you guide me through a breathing exercise?",
        "sleep": "I cannot sleep and have bad insomnia",
        "academic": "I am so overwhelmed by my exam and study load",
        "anxiety": "I am feeling severe panic and worry right now",
        "advice": "What should I do right now to feel better?",
    }

    replies = {}
    for intent, text in prompts.items():
        reply = fallback_reply(text, stress_level="Moderate")
        replies[intent] = reply

    unique_replies = set(replies.values())
    assert len(unique_replies) == len(prompts), (
        f"Expected {len(prompts)} unique replies across intents, got {len(unique_replies)}"
    )

    assert "reset breath" in replies["breathing"]
    assert "phone" in replies["sleep"]
    assert "chunking" in replies["academic"]
    assert "3-3-3" in replies["anxiety"]
    assert "rest" in replies["fatigue"]
    assert "lonely" in replies["sadness"]
    assert "welcome" in replies["gratitude"]


def test_crisis_detection_provides_verified_hotlines():
    """
    Verifies that crisis expressions trigger immediate safety hotline contacts.
    """
    crisis_queries = [
        "I feel like I want to kill myself",
        "I want to end my life, feeling completely hopeless",
    ]
    for q in crisis_queries:
        reply = fallback_reply(q)
        assert "Tele-MANAS" in reply
        assert "KIRAN" in reply
        assert "988" in reply
        assert "SOS" in reply


def test_student_context_integration():
    """
    Verifies that student context (sleep hours, upcoming exam countdown)
    is woven into offline responses.
    """
    ctx_exam = StudentContext(level="High", score=75, exam=3)
    greeting_reply = fallback_reply("hello", stress_level="High", context=ctx_exam)
    assert "exam is coming up in 3 days" in greeting_reply

    ctx_sleep = StudentContext(level="Moderate", score=50, sleep=4.5)
    fatigue_reply = fallback_reply("I feel so tired", stress_level="Moderate", context=ctx_sleep)
    assert "logged 4.5h of sleep" in fatigue_reply


def test_gemini_dynamic_model_configuration():
    """
    Verifies that changing AI_MODEL dynamically switches the model without code edits.
    """
    fake_gemini_key = "AIzaSyFakeValidKeyForUnitTests12345"

    with patch.dict(os.environ, {"GEMINI_API_KEY": fake_gemini_key, "AI_MODEL": "gemini-2.5-flash-lite"}):
        client_obj, model_name, provider = get_llm_client_and_model()
        assert provider == "gemini"
        assert model_name == "gemini-2.5-flash-lite"
        assert client_obj is not None

    with patch.dict(os.environ, {"GEMINI_API_KEY": fake_gemini_key, "AI_MODEL": "gemini-1.5-flash"}):
        client_obj, model_name, provider = get_llm_client_and_model()
        assert provider == "gemini"
        assert model_name == "gemini-1.5-flash"


def test_health_endpoint_accurate_reporting():
    """
    Verifies /health distinguishes configured settings from active provider status.
    Does NOT report Gemini as operational merely because a placeholder exists.
    """
    reset_llm_status()
    # Case 1: Placeholder or empty key -> active provider is offline-guide, llm_ready is False
    with patch.dict(os.environ, {"GEMINI_API_KEY": "your_gemini_api_key_here"}):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "gemini"
        assert data["active_provider"] == "offline-guide"
        assert data["llm_ready"] is False
        assert data["active_model"] is None

    # Case 2: Structurally valid key present -> active provider is gemini, llm_ready is True
    with patch.dict(os.environ, {"GEMINI_API_KEY": "AIzaSyValidGeminiStudioKey987654321"}):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["active_provider"] == "gemini"
        assert data["llm_ready"] is True
        assert data["active_model"] == "gemini-2.5-flash-lite"


def test_live_llm_gemini_mock_success():
    """
    Verifies that when Gemini provider succeeds, the route returns:
    1. Real response content
    2. is_fallback = False
    3. Correct provider attribution ('gemini')
    """
    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "Take a gentle pause and breathe. You have done enough for today."
    mock_client.chat.completions.create.return_value.choices = [mock_choice]

    with patch("app.services.companion_engine.get_llm_client_and_model", return_value=(mock_client, "gemini-2.5-flash-lite", "gemini")):
        payload = {
            "messages": [{"role": "user", "content": "I am feeling stressed"}],
            "context": {"level": "Moderate", "score": 60}
        }
        response = client.post("/chat/message", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["is_fallback"] is False
        assert data["source"] == "gemini"
        assert data["provider"] == "gemini"
        assert "Take a gentle pause" in data["reply"]
        assert not data["reply"].startswith("[Offline Support Guide]")


def test_gemini_timeout_and_error_sanitization():
    """
    Verifies that when Gemini times out or errors, errors are sanitized and
    the system safely falls back without HTTP 500.
    """
    mock_client = MagicMock()
    secret_key = "AIzaSySecretApiKey123456789"
    mock_client.chat.completions.create.side_effect = Exception(f"HTTP 403 Forbidden with key {secret_key}")

    with patch.dict(os.environ, {"GEMINI_API_KEY": secret_key}):
        with patch("app.services.companion_engine.get_llm_client_and_model", return_value=(mock_client, "gemini-2.5-flash-lite", "gemini")):
            payload = {
                "messages": [{"role": "user", "content": "Help me with breathing"}],
                "context": {"level": "High", "score": 80}
            }
            response = client.post("/chat/message", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["is_fallback"] is True
            assert data["source"] == "fallback"
            assert data["provider"] == "offline-guide"
            assert data["reply"].startswith("[Offline Support Guide]")
            assert "reset breath" in data["reply"]

            # Health check must show error status and must NEVER leak the secret key
            health_data = check_llm_health()
            assert health_data["llm_status"] == "error"
            assert secret_key not in (health_data["last_error"] or "")
            assert "[REDACTED_API_KEY]" in (health_data["last_error"] or "")
