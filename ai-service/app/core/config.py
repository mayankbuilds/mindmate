from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    PORT: int = 8000
    GEMINI_API_KEY: str = ""
    AI_PROVIDER: str = "gemini"
    AI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    AI_API_KEY: str = ""
    AI_MODEL: str = "gemini-2.5-flash-lite"
    ALLOWED_ORIGINS: str = "http://localhost:5000,http://127.0.0.1:5000,https://mindmate-wellness.onrender.com"

    @property
    def origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()