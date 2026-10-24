"""Phase 2A authentication response schemas.

Responses deliberately expose the minimum: no Firebase UID, no session token,
and email only for the signed-in Google user themselves.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class GoogleLoginRequest(BaseModel):
    # The Firebase ID token from the frontend SDK; everything else about the
    # identity is derived from verified token claims, never from the body.
    id_token: str = Field(min_length=10, max_length=4096)


class UserOut(BaseModel):
    id: str
    kind: str  # "google" | "guest"
    display_name: str
    email: str | None = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    kind: str  # "real" | "demo"


class SessionOut(BaseModel):
    kind: str  # "google" | "guest"
    expires_at: str  # ISO-8601 UTC


class AuthSessionPayload(BaseModel):
    """Response of /auth/google, /auth/guest and /auth/me."""

    user: UserOut
    workspace: WorkspaceOut
    role: str
    session: SessionOut
    # Client keeps this in memory and echoes it in X-CSRF-Token on mutations.
    csrf_token: str


class WorkspaceSummary(BaseModel):
    """Response of /workspaces/current."""

    workspace: WorkspaceOut
    role: str
    created_at: str
