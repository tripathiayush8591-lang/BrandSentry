"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.request_id import get_request_id


def get_request_id_dep() -> str:
    """Request ID for response bodies (always set by RequestIDMiddleware)."""
    return get_request_id()


def get_db(request: Request) -> Session:
    """Yield a database session managed by the application lifespan."""
    session_factory = request.app.state.session_factory
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


RequestIdDep = Annotated[str, Depends(get_request_id_dep)]
DbSession = Annotated[Session, Depends(get_db)]
