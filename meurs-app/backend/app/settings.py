from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PIXABAY_KEY: str | None = None
    PEXELS_KEY:  str | None = None
    CORS_ORIGINS: str | None = None

    # v2 way to read .env
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
