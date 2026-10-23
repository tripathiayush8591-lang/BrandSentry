"""Aggregated /api/v1 router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import status

api_v1_router = APIRouter()
api_v1_router.include_router(status.router)
