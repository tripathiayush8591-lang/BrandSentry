"""Environment-based application configuration.

All deployment-specific settings come from environment variables (or a local
`.env` file, which is git-ignored). Never put secrets or real credentials in
source control; `.env.example` documents names and placeholders only.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_DEVELOPMENT = "development"


class Settings(BaseSettings):
    """Application settings resolved from the environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- application identity -------------------------------------------------
    app_name: str = "brandsentry-backend"
    app_env: str = _DEVELOPMENT  # development | staging | production
    version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"

    # --- persistence ----------------------------------------------------------
    # Local default lives under backend/.data/db/ (git-ignored).
    # On Railway, mount a persistent volume at /data and set
    # DATABASE_URL=sqlite:////data/db/brandsentry.sqlite (four slashes = absolute path).
    database_url: str = "sqlite:///./.data/db/brandsentry.sqlite"
    # Reserved for Phase 3+ guideline files; kept here so the env contract is stable.
    upload_dir: str = "./.data/uploads"

    # --- HTTP / CORS ----------------------------------------------------------
    # Comma-separated explicit allow-list. Never "*" with credentials.
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Host is inferred when unset: loopback for local development, 0.0.0.0 when
    # hosted so Railway's port forwarding can reach the server.
    host: str | None = None
    port: int = 8000

    # --- observability --------------------------------------------------------
    log_level: str = "INFO"

    @property
    def is_development(self) -> bool:
        return self.app_env.strip().lower() == _DEVELOPMENT

    @property
    def bind_host(self) -> str:
        if self.host and self.host.strip():
            return self.host.strip()
        # 0.0.0.0 is intentional for Railway port forwarding (see DEPLOYMENT_RUNBOOK).
        return "127.0.0.1" if self.is_development else "0.0.0.0"  # noqa: S104

    @property
    def allowed_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.frontend_origins.split(",")]
        return [origin for origin in origins if origin]


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance (cached after first read)."""
    return Settings()
