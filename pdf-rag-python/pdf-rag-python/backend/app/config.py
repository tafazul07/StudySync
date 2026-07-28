from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Server
    PORT: int = 8000

    # OpenRouter
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1/chat/completions"

    @field_validator("OPENROUTER_API_KEY")
    @classmethod
    def validate_openrouter_api_key(cls, api_key: str) -> str:
        if not api_key or api_key.startswith("sk-or-v1-your") or api_key.strip() == "":
            raise ValueError(
                "OPENROUTER_API_KEY must be set to a valid OpenRouter API key in backend/.env or environment variables."
            )
        return api_key
    SITE_URL: str = "http://localhost:8000"
    SITE_NAME: str = "PDF RAG System"

    # Chunking
    CHUNK_SIZE: int = 1200
    CHUNK_OVERLAP: int = 200

    # Retrieval
    TOP_K: int = 5

    # Upload
    MAX_FILE_SIZE_MB: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
