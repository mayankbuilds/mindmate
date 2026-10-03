from pydantic import BaseModel, Field
from typing import Optional, List


class StressComputeRequest(BaseModel):
    sleep: float = Field(..., ge=0, le=24)
    study: float = Field(..., ge=0, le=24)
    screen: float = Field(..., ge=0, le=24)
    exam: int = Field(..., ge=0)
    mood: Optional[str] = "okay"
    note: Optional[str] = ""


class RecommendationItem(BaseModel):
    id: str
    title: str
    blurb: str
    mins: int
    secs: int
    tint: str


class StressComputeResponse(BaseModel):
    score: int
    level: str
    recommendations: List[RecommendationItem]