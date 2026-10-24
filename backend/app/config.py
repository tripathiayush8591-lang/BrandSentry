"""Environment-based application configuration.

All deployment-specific settings come from environment variables (or a local
`.env` file, which is git-ignored). Never put secrets or real credentials in
source control; `.env.example` documents names and placeholders only.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import PurePosixPath

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

    # --- Firebase (Google sign-in verification only; no Firestore/Storage) ----
    firebase_project_id: str = "brandsentry-68d05"
    # Exactly one of the following configures the Admin SDK:
    # 1. Full service-account JSON injected as a single environment variable
    #    (recommended on Railway: Railway -> Variables -> FIREBASE_SERVICE_ACCOUNT_JSON).
    firebase_service_account_json: str | None = None
    # 2. Path to a service-account file on disk (never committed).
    firebase_service_account_file: str | None = None
    # 3. Neither set -> Application Default Credentials, which honours
    #    GOOGLE_APPLICATION_CREDENTIALS or the platform's metadata server.

    # --- sessions / cookies ---------------------------------------------------
    session_cookie_name: str = "brandsentry_session"
    csrf_header_name: str = "X-CSRF-Token"
    # Opaque server-side session lifetimes. Google users refresh by signing in
    # again (a fresh Firebase ID token); guest sessions are deliberately short.
    user_session_ttl_hours: float = 72.0
    guest_session_ttl_hours: float = 4.0
    # Cookie flags. Defaults: Secure everywhere except local development;
    # SameSite=Lax locally (localhost:5173 -> localhost:8000 is same-site),
    # SameSite=None on HTTPS deployments (Vercel -> Railway is cross-site).
    session_cookie_secure: bool | None = None  # None = auto (off only in development)
    session_cookie_samesite: str | None = None  # None = auto ("lax" dev / "none" prod)

    # --- guest abuse controls -------------------------------------------------
    # Max guest sessions created per client IP per rolling window (DB-backed).
    guest_sessions_per_ip_per_hour: int = 10

    # --- knowledge vault (Phase 3A) -------------------------------------------
    # Upload size cap for knowledge documents (raw bytes, before extraction).
    knowledge_max_upload_bytes: int = 5 * 1024 * 1024  # 5 MB
    # Cap on extracted text per document; protects memory/DB from huge PDFs.
    knowledge_max_extracted_chars: int = 200_000
    # Maximum characters per stored chunk (sections are merged/split to fit).
    knowledge_chunk_max_chars: int = 1_000
    # DB-backed rate limits for expensive knowledge operations (per actor per
    # rolling hour). 0 disables a limit.
    knowledge_uploads_per_hour: int = 30
    knowledge_searches_per_hour: int = 120
    # Maximum retrieval results returned per search (client may ask for less).
    knowledge_search_max_top_k: int = 10

    # --- Gemini provider (Phase 3B; backend-only, never exposed to frontend) --
    # Missing key => AI engine reports UNAVAILABLE and deterministic checks
    # still run; never a bypass or a faked completion.
    gemini_api_key: str | None = None
    # Verify current model availability/quota against the real project before
    # deployment (docs/AI_VALIDATION.md §10); configurable, not hardcoded.
    gemini_model: str = "gemini-2.5-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout_seconds: float = 25.0
    gemini_max_output_tokens: int = 2048
    # Bounded retries for transient provider failures (429/5xx/timeout) only.
    # 0 = fail fast; at most 1 in the MVP (docs/AI_VALIDATION.md §6).
    gemini_max_retries: int = 0

    # --- validation engine (Phase 3B) -----------------------------------------
    # Bump when the prompt or output contract changes so cache keys change.
    prompt_version: str = "2026-10-24.1"
    # Input cap for submitted content (characters); oversized input is 413.
    validation_max_content_chars: int = 12_000
    # Approved evidence chunks retrieved per validation run.
    validation_evidence_top_k: int = 6
    # Hard cap on findings persisted per run (deterministic + AI merged).
    validation_max_findings: int = 12
    # Result cache TTL (hours); keys include content/evidence/rule versions.
    validation_cache_ttl_hours: float = 12.0
    # Per-actor/per-workspace validation quotas (rolling hour, DB-backed).
    validation_user_per_hour: int = 20
    validation_guest_per_hour: int = 5
    validation_workspace_per_hour: int = 60
    # Global provider budget per deployment per UTC day (calls and tokens).
    gemini_calls_per_day: int = 100
    gemini_tokens_per_day: int = 500_000

    # --- request limits (Phase 4C) ---------------------------------------------
    # Byte caps enforced before any body buffering (app/core/bodylimit.py).
    # The multipart cap is derived from the knowledge upload cap plus encoding
    # overhead; these two cover JSON API payloads and everything else.
    max_json_body_bytes: int = 256 * 1024
    max_other_body_bytes: int = 1024 * 1024
    # Multipart form overhead (boundaries, fields) allowed on top of the
    # knowledge upload cap when choosing the multipart body cap.
    max_multipart_overhead_bytes: int = 1024 * 1024
    # Fail-closed production storage check (see production_storage_problems).
    # Only local tests that simulate production cookie/HTTPS behaviour with
    # tmp paths turn this off; deployed production keeps the default.
    enforce_production_storage_paths: bool = True

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

    @property
    def cookie_secure(self) -> bool:
        if self.session_cookie_secure is not None:
            return self.session_cookie_secure
        return not self.is_development

    @property
    def cookie_samesite(self) -> str:
        if self.session_cookie_samesite is not None:
            return self.session_cookie_samesite
        return "lax" if self.is_development else "none"

    def production_storage_problems(self) -> list[str]:
        """Fail-closed storage configuration check for production.

        In production both the SQLite database and the upload directory must be
        absolute POSIX paths on a mounted persistent volume (Railway: /data).
        Relative paths would silently write into the ephemeral container layer
        and lose all records on the next deploy (Phase 4A finding 5).
        """
        if self.app_env.strip().lower() != "production":
            return []
        if not self.enforce_production_storage_paths:
            return []
        problems: list[str] = []
        # Four slashes (`sqlite:////abs/path`) make the SQLite path absolute.
        if not self.database_url.startswith("sqlite:////"):
            problems.append(
                "DATABASE_URL must be an absolute path on the persistent volume "
                "(e.g. sqlite:////data/db/brandsentry.sqlite)"
            )
        if not PurePosixPath(self.upload_dir.replace("\\", "/")).is_absolute():
            problems.append(
                "UPLOAD_DIR must be an absolute path on the persistent volume (e.g. /data/uploads)"
            )
        return problems


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance (cached after first read)."""
    return Settings()
