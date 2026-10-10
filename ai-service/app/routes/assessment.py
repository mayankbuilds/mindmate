from fastapi import APIRouter
from app.schemas.assessment import StressAssessmentRequest, StressAssessmentResponse
from app.services.assessment_engine import predict_assessment

router = APIRouter(prefix="/assessment", tags=["Assessment"])


@router.post("/predict", response_model=StressAssessmentResponse)
def assess_stress(payload: StressAssessmentRequest):
    result = predict_assessment(
        nervousness=payload.nervousness,
        unable_to_control=payload.unable_to_control,
        worry=payload.worry,
        trouble_relaxation=payload.trouble_relaxation,
        restlessness=payload.restlessness,
        irritability=payload.irritability,
        fear=payload.fear,
    )
    return StressAssessmentResponse(**result)
