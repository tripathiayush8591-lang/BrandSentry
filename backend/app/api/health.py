"""Liveness and readiness endpoints (top-level, public, no AI calls)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, Response  # Response used in /ready below
from pydantic import BaseModel

from app.api.deps import RequestIdDep
from app.db.session import check_database_connectivity, check_storage_writable

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    request_id: str


class ComponentCheck(BaseModel):
    ok: bool
    detail: str | None = None


class ReadyResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    checks: dict[str, ComponentCheck]
    request_id: str


@router.get("/health", response_model=HealthResponse)
def health(request: Request, request_id: RequestIdDep) -> HealthResponse:
    """Cheap process liveness. Deliberately touches no dependencies."""
    return HealthResponse(
        status="ok",
        service=request.app.state.settings.app_name,
        version=request.app.state.settings.version,
        request_id=request_id,
    )


@router.get(
    "/ready",
    response_model=ReadyResponse,
    responses={503: {"model": ReadyResponse, "description": "Not ready"}},
)
def ready(request: Request, request_id: RequestIdDep) -> Response:
    """Readiness: SQLite connectivity and a writable storage location.

    Returns 503 (with the same body shape) when any check fails. Never calls
    external providers such as Gemini.
    """
    settings = request.app.state.settings
    engine = request.app.state.engine

    db_ok, db_detail = check_database_connectivity(engine)
    storage_ok, storage_detail = check_storage_writable(settings.database_url)
    checks: dict[str, ComponentCheck] = {
        "database": ComponentCheck(ok=db_ok, detail=db_detail),
        "storage": ComponentCheck(ok=storage_ok, detail=storage_detail),
    }
    body = ReadyResponse(
        status="ready" if all(check.ok for check in checks.values()) else "not_ready",
        checks=checks,
        request_id=request_id,
    )
    status_code = 200 if body.status == "ready" else 503
    return Response(
        content=body.model_dump_json(),
        status_code=status_code,
        media_type="application/json",
    )
