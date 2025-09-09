from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
from .config import PIXABAY_API_KEY, PEXELS_API_KEY, YT_API_KEY  # <-- Import fallback keys

class Settings(BaseSettings):
    # Environment variables (optional)
    PIXABAY_KEY: Optional[str] = None
    PEXELS_KEY: Optional[str] = None
    YT_API_KEY: Optional[str] = None
    CORS_ORIGINS: Optional[str] = None

    # Load from .env file if present
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # -------------------------------
    # Helper properties for fallbacks
    # -------------------------------
    @property
    def pixabay_key(self) -> Optional[str]:
        """Use .env key if set, else fallback to config.py."""
        return self.PIXABAY_KEY or PIXABAY_API_KEY

    @property
    def pexels_key(self) -> Optional[str]:
        """Use .env key if set, else fallback to config.py."""
        return self.PEXELS_KEY or PEXELS_API_KEY

    @property
    def yt_key(self) -> Optional[str]:
        """Use .env key if set, else fallback to config.py."""
        return self.YT_API_KEY or YT_API_KEY

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        if not self.CORS_ORIGINS:
            return []
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

# Create a single settings instance
settings = Settings()
