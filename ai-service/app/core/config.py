from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PORT: int = 8000
    GEMINI_API_KEY: str = ""
    AI_PROVIDER: str = "groq"
    AI_BASE_URL: str = "https://api.groq.com/openai/v1"
    AI_API_KEY: str = ""
    AI_MODEL: str = "qwen-2.5-32b"
    ALLOWED_ORIGINS: str = "http://localhost:5000,http://127.0.0.1:5000"

    @property
    def origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()