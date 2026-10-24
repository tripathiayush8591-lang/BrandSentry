"""Shared FastAPI dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.request_id import get_request_id
from app.db.models import AuthSession
from app.services.identity import ActorWorkspace, csrf_matches, load_actor, resolve_session


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


def get_client_ip(request: Request) -> str | None:
    """Client IP for per-IP abuse controls (guest sessions).

    Behind the single trusted edge proxy (Railway), the proxy appends the real
    client address as the **last** ``X-Forwarded-For`` entry; anything a caller
    spoofed appears earlier in the list. Taking the first entry would let a
    client mint unlimited fresh identities and bypass per-IP limits, so the
    rightmost entry is used. Direct unproxied requests carry no such header
    and fall back to the socket address.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip() or None
    return request.client.host if request.client else None


def get_current_session(request: Request, db: DbSession) -> AuthSession:
    """Resolve the opaque session cookie to a live server-side session."""
    settings = request.app.state.settings
    raw_token = request.cookies.get(settings.session_cookie_name)
    session = resolve_session(db, raw_token or "")
    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required: missing, expired or revoked session",
        )
    return session


def get_current_actor(
    session: Annotated[AuthSession, Depends(get_current_session)], db: DbSession
) -> ActorWorkspace:
    actor = load_actor(db, session)
    if actor is None:
        # Session exists but its user/workspace/membership vanished.
        raise HTTPException(status_code=401, detail="Session is no longer valid")
    return actor


def verify_csrf(
    request: Request, session: Annotated[AuthSession, Depends(get_current_session)]
) -> None:
    """State-changing authenticated requests must present the session CSRF token."""
    settings = request.app.state.settings
    presented = request.headers.get(settings.csrf_header_name)
    if not csrf_matches(session, presented):
        raise HTTPException(status_code=403, detail="CSRF validation failed")


def check_origin(request: Request) -> None:
    """Defence against login CSRF on unauthenticated POST endpoints.

    Browsers always send Origin on cross-origin POSTs; if present it must be
    allow-listed. Non-browser clients (no Origin header) are unaffected.
    """
    origin = request.headers.get("origin")
    if origin is None:
        return
    settings = request.app.state.settings
    if origin not in settings.allowed_origins:
        raise HTTPException(status_code=403, detail="Origin not allowed")


RequestIdDep = Annotated[str, Depends(get_request_id_dep)]
DbSession = Annotated[Session, Depends(get_db)]
CurrentActor = Annotated[ActorWorkspace, Depends(get_current_actor)]
CurrentSession = Annotated[AuthSession, Depends(get_current_session)]
CsrfVerified = Annotated[None, Depends(verify_csrf)]
OriginChecked = Annotated[None, Depends(check_origin)]


def require_roles(*roles: str):
    """Dependency factory enforcing server-side membership roles.

    Roles always come from the DB membership resolved for the session, never
    from client input. A 403 leaks nothing about the resource: the actor is
    authenticated but not permitted.
    """

    def dependency(actor: CurrentActor) -> ActorWorkspace:
        if actor.role not in roles:
            raise HTTPException(
                status_code=403,
                detail="Your workspace role does not permit this operation",
            )
        return actor

    return dependency


Author = Annotated[ActorWorkspace, Depends(require_roles("admin", "creator"))]
AdminOnly = Annotated[ActorWorkspace, Depends(require_roles("admin"))]


@dataclass(frozen=True)
class RequestMeta:
    ip: str | None
    user_agent: str | None


def get_request_meta(request: Request) -> RequestMeta:
    return RequestMeta(ip=get_client_ip(request), user_agent=request.headers.get("user-agent"))


RequestMetaDep = Annotated[RequestMeta, Depends(get_request_meta)]
