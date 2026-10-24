"""Phase 2A authentication endpoints.

Session model (contract amendment, see docs/DATA_API_CONTRACTS.md §8):
- The backend issues a 256-bit opaque session token after either a verified
  Firebase Google sign-in or a guest demo signup.
- The token lives only in a Secure/HttpOnly/SameSite cookie; raw tokens are
  never stored server-side (only SHA-256 hashes) and never returned in bodies.
- A second, JavaScript-readable CSRF cookie mirrors the session-bound CSRF
  token so the SPA can echo it in ``X-CSRF-Token``; the server always verifies
  the header against the DB hash, so the cookie is a convenience, not a trust
  decision.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response

from app.api.deps import (
    CsrfVerified,
    CurrentActor,
    CurrentSession,
    DbSession,
    OriginChecked,
    RequestMetaDep,
)
from app.schemas.auth import AuthSessionPayload, GoogleLoginRequest
from app.services.firebase import FirebaseNotConfiguredError, FirebaseTokenInvalidError
from app.services.identity import (
    ActorWorkspace,
    GuestRateLimitExceeded,
    create_google_session,
    create_guest_session,
    get_or_create_google_user,
    load_actor,
    revoke_session,
)

router = APIRouter(tags=["auth"])

_FIREBASE_UNCONFIGURED_MESSAGE = (
    "Google sign-in is temporarily unavailable: the server's Firebase Admin "
    "credentials are not configured or the verification service cannot be reached."
)


def _auth_payload(
    actor: ActorWorkspace, *, kind: str, expires_at: datetime, csrf_token: str
) -> AuthSessionPayload:
    return AuthSessionPayload(
        user={
            "id": actor.user.id,
            "kind": actor.user.user_kind,
            "display_name": actor.user.display_name,
            # Email only inside the Google user's own session; guests have none.
            "email": actor.user.email if actor.user.user_kind == "google" else None,
        },
        workspace={
            "id": actor.workspace.id,
            "name": actor.workspace.name,
            "kind": actor.workspace.kind,
        },
        role=actor.role,
        session={"kind": kind, "expires_at": expires_at.isoformat()},
        csrf_token=csrf_token,
    )


def _set_session_cookies(
    response: Response, request: Request, raw_token: str, csrf_token: str, ttl_seconds: float
) -> None:
    settings = request.app.state.settings
    common = {
        "max_age": int(ttl_seconds),
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "path": "/",
    }
    response.set_cookie(key=settings.session_cookie_name, value=raw_token, httponly=True, **common)
    # Readable mirror for the SPA's X-CSRF-Token header; not authoritative.
    response.set_cookie(
        key=f"{settings.session_cookie_name}-csrf",
        value=csrf_token,
        httponly=False,
        **common,
    )


def _clear_session_cookies(response: Response, request: Request) -> None:
    settings = request.app.state.settings
    for name in (settings.session_cookie_name, f"{settings.session_cookie_name}-csrf"):
        response.delete_cookie(
            key=name,
            path="/",
            secure=settings.cookie_secure,
            httponly=(name == settings.session_cookie_name),
            samesite=settings.cookie_samesite,
        )


@router.post("/auth/google", response_model=AuthSessionPayload)
def login_google(
    body: GoogleLoginRequest,
    request: Request,
    response: Response,
    db: DbSession,
    meta: RequestMetaDep,
    _origin: OriginChecked,
) -> AuthSessionPayload:
    """Establish a Google-backed application identity from a Firebase ID token."""
    verifier = request.app.state.firebase_verifier
    try:
        identity = verifier.verify(body.id_token)
    except FirebaseTokenInvalidError as exc:
        raise HTTPException(status_code=401, detail=f"Google sign-in rejected: {exc}") from exc
    except FirebaseNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=_FIREBASE_UNCONFIGURED_MESSAGE) from exc

    settings = request.app.state.settings
    actor = get_or_create_google_user(db, identity)
    issued = create_google_session(db, settings, actor, meta.ip, meta.user_agent)
    ttl = settings.user_session_ttl_hours * 3600
    _set_session_cookies(response, request, issued.raw_token, issued.csrf_token, ttl)
    return _auth_payload(
        actor, kind="google", expires_at=issued.session.expires_at, csrf_token=issued.csrf_token
    )


@router.post("/auth/guest", status_code=201, response_model=AuthSessionPayload)
def create_guest(
    request: Request,
    response: Response,
    db: DbSession,
    meta: RequestMetaDep,
    _origin: OriginChecked,
) -> AuthSessionPayload:
    """Create an isolated guest demo session (no Firebase involvement)."""
    settings = request.app.state.settings
    try:
        issued = create_guest_session(db, settings, meta.ip, meta.user_agent)
    except GuestRateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Too many guest sessions from this address. Please retry later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    actor = load_actor(db, issued.session)
    assert actor is not None, "freshly created guest actor must resolve"
    ttl = settings.guest_session_ttl_hours * 3600
    _set_session_cookies(response, request, issued.raw_token, issued.csrf_token, ttl)
    return _auth_payload(
        actor, kind="guest", expires_at=issued.session.expires_at, csrf_token=issued.csrf_token
    )


@router.get("/auth/me", response_model=AuthSessionPayload)
def read_me(session: CurrentSession, actor: CurrentActor) -> AuthSessionPayload:
    """Current identity, effective workspace and role for any signed-in actor.

    ``csrf_token`` is empty here by design: after a page refresh the SPA reads
    the non-HttpOnly CSRF cookie; login endpoints return it in the body.
    """
    return _auth_payload(actor, kind=session.kind, expires_at=session.expires_at, csrf_token="")


@router.post("/auth/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    session: CurrentSession,
    _csrf: CsrfVerified,
    db: DbSession,
) -> Response:
    """Revoke the current application session and clear its cookies."""
    revoke_session(db, session)
    response.status_code = 204
    _clear_session_cookies(response, request)
    return response


@router.post("/auth/guest/revoke", status_code=204)
def revoke_guest(
    request: Request,
    response: Response,
    session: CurrentSession,
    _csrf: CsrfVerified,
    db: DbSession,
) -> Response:
    """Guest-specific revoke; mirrors /auth/logout and rejects other kinds."""
    if session.kind != "guest":
        raise HTTPException(status_code=403, detail="Not a guest session")
    revoke_session(db, session)
    response.status_code = 204
    _clear_session_cookies(response, request)
    return response
