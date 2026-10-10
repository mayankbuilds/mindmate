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

    # Case 2: Structurally valid key present before any request -> llm_ready is False, status is configured_unverified
    with patch.dict(os.environ, {"GEMINI_API_KEY": "AIzaSyValidGeminiStudioKey987654321"}):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "gemini"
        assert data["llm_ready"] is False
        assert data["llm_status"] == "configured_unverified"
        assert data["active_provider"] == "offline-guide"

    # Case 3: After a successful real Gemini request -> llm_ready is True, status is operational
    from app.core.llm import record_llm_success
    record_llm_success("gemini", "gemini-3.5-flash-lite")
    with patch.dict(os.environ, {"GEMINI_API_KEY": "AIzaSyValidGeminiStudioKey987654321"}):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["active_provider"] == "gemini"
        assert data["llm_ready"] is True
        assert data["llm_status"] == "operational"
        assert data["active_model"] == "gemini-3.5-flash-lite"


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
            assert health_data["error_type"] == "authentication_error"
            assert secret_key not in (health_data["last_error"] or "")
            assert "[REDACTED_API_KEY]" in (health_data["last_error"] or "")

            # Response should expose diagnostic error_type
            assert data.get("error_type") == "authentication_error"


def test_classify_llm_error_categories():
    """
    Verifies that classify_llm_error distinguishes connection errors, cold-start timeouts,
    authentication errors, model-not-found errors, and quota errors.
    """
    from app.core.llm import classify_llm_error

    # Auth error
    class MockHttpError(Exception):
        def __init__(self, msg, status_code):
            super().__init__(msg)
            self.status_code = status_code

    assert classify_llm_error(MockHttpError("401 Unauthorized", 401)) == "authentication_error"
    assert classify_llm_error(MockHttpError("Please pass a valid API key", 400)) == "authentication_error"
    assert classify_llm_error(Exception("API_KEY_INVALID")) == "authentication_error"

    # Model not found
    assert classify_llm_error(MockHttpError("models/gemini-not-found is not found", 404)) == "model_not_found"
    assert classify_llm_error(Exception("The model `gemini-unknown` does not exist")) == "model_not_found"

    # Quota exceeded
    assert classify_llm_error(MockHttpError("RESOURCE_EXHAUSTED", 429)) == "quota_exceeded"
    assert classify_llm_error(Exception("Quota exceeded for quota metric")) == "quota_exceeded"

    # Timeout
    assert classify_llm_error(TimeoutError("Request timed out")) == "timeout"
    assert classify_llm_error(Exception("APITimeoutError: Connection timed out")) == "timeout"

    # Connection error
    assert classify_llm_error(ConnectionRefusedError("Connection refused")) == "connection_error"
    assert classify_llm_error(Exception("APIConnectionError: Failed to connect")) == "connection_error"


def test_clean_api_key_removes_surrounding_quotes_and_brackets():
    """
    Verifies clean_api_key strips quotes and brackets that users may paste into Render.
    """
    from app.core.llm import clean_api_key, is_valid_gemini_key

    raw_quoted = '"AIzaSyValidLengthKeyWithQuotes12345"'
    cleaned = clean_api_key(raw_quoted)
    assert cleaned == "AIzaSyValidLengthKeyWithQuotes12345"
    assert is_valid_gemini_key(raw_quoted) is True

    raw_single_quoted = "'AIzaSyValidLengthKeySingleQuotes123'"
    assert clean_api_key(raw_single_quoted) == "AIzaSyValidLengthKeySingleQuotes123"

    raw_brackets = "<AIzaSyValidLengthKeyInsideBrackets1>"
    assert clean_api_key(raw_brackets) == "AIzaSyValidLengthKeyInsideBrackets1"


def test_model_not_found_resilient_retry_fallback():
    """
    Verifies that when primary model throws model_not_found (404),
    companion engine retries with gemini-3.5-flash-lite before failing.
    """
    mock_client = MagicMock()

    class ModelNotFoundError(Exception):
        status_code = 404

    # First call with primary model throws 404; second call with fallback succeeds
    mock_choice = MagicMock()
    mock_choice.message.content = "Here is a calm response from the fallback model."
    mock_client.chat.completions.create.side_effect = [
        ModelNotFoundError("models/gemini-2.5-flash-lite not found"),
        MagicMock(choices=[mock_choice]),
    ]

    with patch("app.services.companion_engine.get_llm_client_and_model", return_value=(mock_client, "gemini-2.5-flash-lite", "gemini")):
        payload = {
            "messages": [{"role": "user", "content": "I am feeling overwhelmed"}],
            "context": {"level": "High", "score": 70}
        }
        response = client.post("/chat/message", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["is_fallback"] is False
        assert "calm response" in data["reply"]
        # Verify it retried with gemini-3.5-flash-lite
        assert mock_client.chat.completions.create.call_count == 2
        second_call_model = mock_client.chat.completions.create.call_args_list[1][1]["model"]
        assert second_call_model == "gemini-3.5-flash-lite"

