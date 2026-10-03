from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routes import wellness, chat

app = FastAPI(
    title="MindMate AI Service",
    version="1.0.0",
    description="Microservice for stress calculation, recommendations and Qwen AI Companion",
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


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "provider": settings.AI_PROVIDER,
        "model": settings.AI_MODEL,
    }