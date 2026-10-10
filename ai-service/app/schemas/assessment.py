from pydantic import BaseModel, Field
from typing import Dict


class StressAssessmentRequest(BaseModel):
    nervousness: int = Field(..., ge=0, le=3, description="0=No, 1=Mild, 2=Moderate, 3=Severe")
    unable_to_control: int = Field(..., ge=0, le=3, description="0=No, 1=Mild, 2=Moderate, 3=Severe")
    worry: int = Field(..., ge=0, le=3, description="0=No, 1=Mild, 2=Moderate, 3=Severe")
    trouble_relaxation: int = Field(..., ge=0, le=3, description="0=No, 1=Mild, 2=Moderate, 3=Severe")
    restlessness: int = Field(..., ge=0, le=3, description="0=No, 1=Mild, 2=Moderate, 3=Severe")
    irritability: int = Field(..., ge=0, le=3, description="0=No, 1=Mild, 2=Moderate, 3=Severe")
    fear: int = Field(..., ge=0, le=3, description="0=No, 1=Mild, 2=Moderate, 3=Severe")


class StressAssessmentResponse(BaseModel):
    predicted_class: str = Field(..., description="Dataset target label: 'No', 'Mild', 'Moderate', or 'Severe'")
    class_index: int = Field(..., ge=0, le=3, description="Encoded index 0-3")
    probabilities: Dict[str, float] = Field(..., description="Model confidence probabilities per class")
    model_version: str = Field(default="RandomForest_MultiTier_v1")
    disclaimer: str = Field(
        default="This is a machine learning survey pattern prediction for educational reflection. It does not provide clinical or psychiatric diagnosis."
    )
