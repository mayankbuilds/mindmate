import pytest
import math
import os
import joblib
from unittest.mock import patch
from fastapi.testclient import TestClient
from sklearn.pipeline import Pipeline

from app.main import app
from app.services import assessment_engine

client = TestClient(app)

VALID_CLASSES = ["No", "Mild", "Moderate", "Severe"]


def test_model_pipeline_artifact_integrity():
    """Verifies that the serialized pipeline exists and contains scaler + classifier steps."""
    pipeline_path = assessment_engine.PIPELINE_PATH
    assert os.path.exists(pipeline_path), f"Artifact missing at {pipeline_path}"

    obj = joblib.load(pipeline_path)
    assert isinstance(obj, Pipeline), "Saved model must be a scikit-learn Pipeline"
    assert "scaler" in obj.named_steps, "Pipeline must contain 'scaler' step"
    assert "classifier" in obj.named_steps, "Pipeline must contain 'classifier' step"
    assert hasattr(obj, "predict"), "Pipeline must support predict"
    assert hasattr(obj, "predict_proba"), "Pipeline must support predict_proba"


def test_assessment_predict_valid_inference():
    """
    Tests valid questionnaire inference via POST /assessment/predict.
    Verifies that the route returns a valid dataset class and genuine probabilities.
    """
    payload = {
        "nervousness": 1,
        "unable_to_control": 1,
        "worry": 2,
        "trouble_relaxation": 1,
        "restlessness": 2,
        "irritability": 1,
        "fear": 1,
    }

    response = client.post("/assessment/predict", json=payload)
    assert response.status_code == 200, response.text

    data = response.json()
    assert data["predicted_class"] in VALID_CLASSES
    assert data["class_index"] in [0, 1, 2, 3]
    assert data["predicted_class"] == VALID_CLASSES[data["class_index"]]

    probs = data["probabilities"]
    assert set(probs.keys()) == set(VALID_CLASSES)
    for p in probs.values():
        assert 0.0 <= p <= 1.0

    assert math.isclose(sum(probs.values()), 1.0, rel_tol=1e-3), "Probabilities must sum to 1.0"
    assert "disclaimer" in data and len(data["disclaimer"]) > 10


def test_assessment_input_validation_out_of_range():
    """Tests that out-of-range feature inputs (>3 or <0) are rejected with HTTP 422."""
    payload_high = {
        "nervousness": 4,  # Invalid: max is 3
        "unable_to_control": 1,
        "worry": 1,
        "trouble_relaxation": 1,
        "restlessness": 1,
        "irritability": 1,
        "fear": 1,
    }
    res_high = client.post("/assessment/predict", json=payload_high)
    assert res_high.status_code == 422

    payload_neg = {
        "nervousness": -1,  # Invalid: min is 0
        "unable_to_control": 1,
        "worry": 1,
        "trouble_relaxation": 1,
        "restlessness": 1,
        "irritability": 1,
        "fear": 1,
    }
    res_neg = client.post("/assessment/predict", json=payload_neg)
    assert res_neg.status_code == 422


def test_assessment_input_validation_missing_field():
    """Tests that payloads missing required fields are rejected with HTTP 422."""
    payload_incomplete = {
        "nervousness": 1,
        "worry": 2,
        # missing other 5 fields
    }
    res = client.post("/assessment/predict", json=payload_incomplete)
    assert res.status_code == 422


def test_assessment_service_unavailable_503():
    """Tests that an unavailable model artifact returns HTTP 503 without disguising errors."""
    with patch.object(assessment_engine, "_pipeline", None):
        payload = {
            "nervousness": 0,
            "unable_to_control": 0,
            "worry": 0,
            "trouble_relaxation": 0,
            "restlessness": 0,
            "irritability": 0,
            "fear": 0,
        }
        res = client.post("/assessment/predict", json=payload)
        assert res.status_code == 503
        assert "unavailable" in res.json()["detail"].lower()


def test_model_invocation_verified():
    """Proves that the real Pipeline predict_proba is genuinely invoked during execution."""
    assert assessment_engine._pipeline is not None
    original_predict_proba = assessment_engine._pipeline.predict_proba

    called = False

    def spy_predict_proba(X):
        nonlocal called
        called = True
        return original_predict_proba(X)

    with patch.object(assessment_engine._pipeline, "predict_proba", side_effect=spy_predict_proba):
        payload = {
            "nervousness": 2,
            "unable_to_control": 2,
            "worry": 2,
            "trouble_relaxation": 2,
            "restlessness": 2,
            "irritability": 2,
            "fear": 2,
        }
        res = client.post("/assessment/predict", json=payload)
        assert res.status_code == 200
        assert called, "Pipeline predict_proba was not invoked during inference"
