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
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.request_id import REQUEST_ID_HEADER, RequestIDMiddleware
from app.db.session import make_engine, make_session_factory

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = make_engine(settings.database_url)
        app.state.settings = settings
        app.state.engine = engine
        app.state.session_factory = make_session_factory(engine)
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

    # Middleware order: add_middleware prepends, so CORS ends up wrapping the
    # request-ID middleware and can decorate error responses as well.
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,  # bearer-token auth later; no cookies for now
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        expose_headers=[REQUEST_ID_HEADER],
    )

    register_exception_handlers(app)

    app.include_router(health_router)
    app.include_router(api_v1_router, prefix=settings.api_v1_prefix)

    return app


app = create_app()
