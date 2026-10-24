"""Workspace endpoints (Phase 2A: current workspace only)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentActor
from app.schemas.auth import WorkspaceSummary

router = APIRouter(tags=["workspaces"])


@router.get("/workspaces/current", response_model=WorkspaceSummary)
def current_workspace(actor: CurrentActor) -> WorkspaceSummary:
    """Summary of the workspace the caller's session is scoped to.

    Phase 2A has no workspace-switching: every query is scoped to this
    workspace server-side, so cross-workspace access is impossible by
    construction rather than by parameter checking.
    """
    return WorkspaceSummary(
        workspace={
            "id": actor.workspace.id,
            "name": actor.workspace.name,
            "kind": actor.workspace.kind,
        },
        role=actor.role,
        created_at=actor.workspace.created_at.isoformat(),
    )
