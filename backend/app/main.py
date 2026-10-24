"""FastAPI application factory.

Run locally from the ``backend/`` directory:

    python -m app            # or: uvicorn app.main:app --reload

Railway (Phase 4): start command ``python -m app``; the server binds
``settings.bind_host`` (0.0.0.0 outside development) and listens on the
platform-injected ``PORT``.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.health import router as health_router
from app.api.v1.router import api_v1_router
from app.config import Settings, get_settings
from app.core.bodylimit import BodyLimitMiddleware
from app.core.cache import CacheControlMiddleware
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.request_id import REQUEST_ID_HEADER, RequestIDMiddleware
from app.db.migrations import run_migrations
from app.db.session import make_engine, make_session_factory
from app.services.firebase import build_verifier
from app.services.gemini import GeminiProvider

logger = logging.getLogger(__name__)

# Multipart form encoding (boundaries, fields, quoting) overhead allowed on
# top of the knowledge upload cap when capping multipart bodies.
_MULTIPART_OVERHEAD_BYTES = 1024 * 1024


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    # Fail-closed production storage check: relative SQLite/upload paths would
    # write into the ephemeral container layer and lose all records on the
    # next deploy, so such a configuration must never start serving.
    storage_problems = settings.production_storage_problems()
    if storage_problems:
        raise RuntimeError(
            "Refusing to start in production with non-durable storage configuration: "
            + "; ".join(storage_problems)
        )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = make_engine(settings.database_url)
        app.state.settings = settings
        app.state.engine = engine
        app.state.session_factory = make_session_factory(engine)
        # Railway's volume only exists at runtime, so schema migrations run
        # here rather than at build time (docs/DEPLOYMENT_RUNBOOK.md §7).
        app.state.migrations_ok = run_migrations(settings.database_url)
        # Firebase Admin SDK initialisation is deferred to first verification;
        # tests replace this verifier to mock the provider boundary.
        app.state.firebase_verifier = build_verifier(settings)
        # Gemini adapter: a missing key keeps the provider honestly
        # UNAVAILABLE (deterministic checks still run). Tests replace this
        # object to mock the provider boundary.
        app.state.gemini_provider = GeminiProvider(settings)
        logger.info(
            "%s %s starting (env=%s)", settings.app_name, settings.version, settings.app_env
        )
        yield
        engine.dispose()
        logger.info("%s shut down", settings.app_name)

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        lifespan=lifespan,
        # Docs stay enabled for now; lock down in production hardening if needed.
    )

    # Middleware order: add_middleware prepends, so the LAST added middleware
    # is outermost. Chain (outer -> inner): RequestID -> CacheControl -> CORS
    # -> BodyLimit -> app. Every response, including the early 413 rejections
    # and CORS pass-throughs, therefore carries a request ID and the private
    # no-store cache policy, while 413s still pass through CORS so allowed
    # browser origins can read them.
    multipart_body_limit = (
        settings.knowledge_max_upload_bytes + settings.max_multipart_overhead_bytes
    )
    app.add_middleware(
        BodyLimitMiddleware,
        multipart_limit=multipart_body_limit,
        json_limit=settings.max_json_body_bytes,
        default_limit=settings.max_other_body_bytes,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        # Cookie-based sessions need credentialed CORS; the origin list stays
        # explicit (never "*") so credentials are only sent to allow-listed
        # frontend origins.
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token"],
        expose_headers=[REQUEST_ID_HEADER, "Retry-After"],
    )
    app.add_middleware(CacheControlMiddleware)
    app.add_middleware(RequestIDMiddleware)

    register_exception_handlers(app)

    app.include_router(health_router)
    app.include_router(api_v1_router, prefix=settings.api_v1_prefix)

    return app


app = create_app()
