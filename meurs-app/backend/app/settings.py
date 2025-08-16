from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Optional keys (put them in a .env file or docker env)
    PIXABAY_KEY: str | None = None
    PEXELS_KEY: str | None = None

    # CORS (optional override; comma-separated list)
    CORS_ORIGINS: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()
