import os
import joblib
import pandas as pd
from typing import Dict, Any, Optional
from fastapi import HTTPException

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(BASE_DIR, "models")
PIPELINE_PATH = os.path.join(MODELS_DIR, "student_stress_pipeline.joblib")

FEATURE_COLS = [
    "Nervousness",
    "Unable to control",
    "Worry",
    "Trouble in Relaxation",
    "Restlessness",
    "Irritability",
    "Fear",
]

TARGET_CLASSES = ["No", "Mild", "Moderate", "Severe"]

_pipeline: Optional[Any] = None
_load_error: Optional[str] = None


def load_pipeline(path: str = PIPELINE_PATH) -> bool:
    global _pipeline, _load_error
    if not os.path.exists(path):
        _pipeline = None
        _load_error = f"Pipeline artifact not found at {path}"
        return False
    try:
        _pipeline = joblib.load(path)
        _load_error = None
        return True
    except Exception as e:
        _pipeline = None
        _load_error = f"Failed to load pipeline: {str(e)}"
        return False


def is_model_ready() -> bool:
    return _pipeline is not None


# Eagerly attempt to load on module import
load_pipeline()


def predict_assessment(
    nervousness: int,
    unable_to_control: int,
    worry: int,
    trouble_relaxation: int,
    restlessness: int,
    irritability: int,
    fear: int,
) -> Dict[str, Any]:
    """
    Executes real inference on the loaded scikit-learn Pipeline.
    Strictly raises HTTP 503 if the model artifact is unavailable.
    """
    if not is_model_ready():
        detail_msg = _load_error or "Machine learning assessment model is currently unavailable."
        raise HTTPException(status_code=503, detail=detail_msg)

    # Construct input vector in strict feature order
    input_data = pd.DataFrame(
        [[
            nervousness,
            unable_to_control,
            worry,
            trouble_relaxation,
            restlessness,
            irritability,
            fear,
        ]],
        columns=FEATURE_COLS,
    )

    try:
        pred_index = int(_pipeline.predict(input_data)[0])
        prob_values = _pipeline.predict_proba(input_data)[0]

        predicted_label = TARGET_CLASSES[pred_index]
        probabilities = {
            TARGET_CLASSES[i]: float(round(prob_values[i], 4))
            for i in range(len(TARGET_CLASSES))
        }

        return {
            "predicted_class": predicted_label,
            "class_index": pred_index,
            "probabilities": probabilities,
            "model_version": "RandomForest_MultiTier_v1",
            "disclaimer": "This is a machine learning survey pattern prediction for educational reflection. It does not provide clinical or psychiatric diagnosis.",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Inference execution failed: {str(e)}",
        )
