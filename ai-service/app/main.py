from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routes import wellness, chat, assessment
from app.core.llm import check_llm_health
from app.services.assessment_engine import is_model_ready

app = FastAPI(
    title="MindMate AI Service",
    version="1.0.0",
    description="Microservice for stress calculation, recommendations, ML assessment and AI Companion",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(wellness.router)
app.include_router(chat.router)
app.include_router(assessment.router)


@app.get("/health")
def health_check():
    ready = is_model_ready()
    llm_info = check_llm_health()
    return {
        "status": "healthy" if ready else "degraded",
        "provider": llm_info["configured_provider"],
        "model": llm_info["configured_model"],
        "active_provider": llm_info["active_provider"],
        "active_model": llm_info["active_model"],
        "llm_ready": llm_info["llm_ready"],
        "llm_status": llm_info["llm_status"],
        "llm_error_type": llm_info.get("error_type"),
        "llm_last_error": llm_info.get("last_error"),
        "ml_inference_ready": ready,
    }