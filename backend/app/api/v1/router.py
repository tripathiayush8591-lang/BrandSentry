"""Aggregated /api/v1 router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, knowledge, status, validation, workspaces

api_v1_router = APIRouter()
api_v1_router.include_router(auth.router)
api_v1_router.include_router(workspaces.router)
api_v1_router.include_router(knowledge.router)
api_v1_router.include_router(validation.router)
api_v1_router.include_router(status.router)
