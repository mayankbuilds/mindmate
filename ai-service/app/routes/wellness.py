from fastapi import APIRouter
from app.schemas.wellness import StressComputeRequest, StressComputeResponse
from app.services.stress_engine import compute_stress_score, level_of, get_recommendations

router = APIRouter(prefix="/wellness", tags=["Wellness"])


@router.post("/compute-stress", response_model=StressComputeResponse)
def compute_stress(payload: StressComputeRequest):
    score = compute_stress_score(
        sleep=payload.sleep,
        study=payload.study,
        screen=payload.screen,
        exam=payload.exam,
        mood=payload.mood,
        note=payload.note,
    )
    level = level_of(score)
    recs = get_recommendations(sleep=payload.sleep, study=payload.study, screen=payload.screen)

    return StressComputeResponse(
        score=score,
        level=level,
        recommendations=recs,
    )