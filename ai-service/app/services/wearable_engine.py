import os
import pickle
import numpy as np
from typing import Dict, Any

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(BASE_DIR, "models")

_wearable_clf = None
_wearable_reg = None

try:
    c_path = os.path.join(MODELS_DIR, "stress-classifier-model.pkl")
    r_path = os.path.join(MODELS_DIR, "stress-model-regressor.pkl")
    if os.path.exists(c_path):
        with open(c_path, "rb") as f:
            _wearable_clf = pickle.load(f)
    if os.path.exists(r_path):
        with open(r_path, "rb") as f:
            _wearable_reg = pickle.load(f)
except Exception as e:
    print(f"[WearableEngine Notice] Wearable pickle load notice: {e}")


def predict_wearable_stress(temperature: float, hr: float, gsr: float) -> Dict[str, Any]:
    """
    Predicts stress level from physiological signals:
    - temperature: Body / skin temperature (e.g. 33.5 - 37.0 C)
    - hr: Heart rate in beats per minute (e.g. 60 - 140 BPM)
    - gsr: Galvanic skin response / EDA in microSiemens (e.g. 1.0 - 15.0 uS)
    """
    stress_mapping = {0: "Low", 1: "Medium", 2: "High"}

    hr_factor = max(0.0, hr - 72.0) / 40.0
    gsr_factor = max(0.0, gsr - 2.5) / 8.0
    temp_factor = max(0.0, 36.5 - temperature) / 2.0

    raw_score = (0.5 * hr_factor + 0.35 * gsr_factor + 0.15 * temp_factor) * 100.0
    computed_score = round(float(np.clip(raw_score, 5.0, 95.0)), 1)

    if computed_score < 35.0:
        level = "Low"
    elif computed_score < 65.0:
        level = "Medium"
    else:
        level = "High"

    return {
        "stress_score": computed_score,
        "stress_level": level,
        "status": "success",
    }
