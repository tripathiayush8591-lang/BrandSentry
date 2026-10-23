"""GET /api/v1/status — structured proof that the backend is reachable."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.api.deps import RequestIdDep

router = APIRouter(tags=["status"])


class StatusResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str
    api_version: Literal["v1"]
    time_utc: str
    request_id: str


@router.get("/status", response_model=StatusResponse)
def status(request: Request, request_id: RequestIdDep) -> StatusResponse:
    settings = request.app.state.settings
    return StatusResponse(
        status="ok",
        service=settings.app_name,
        version=settings.version,
        environment=settings.app_env,
        api_version="v1",
        time_utc=datetime.now(UTC).isoformat(),
        request_id=request_id,
    )
