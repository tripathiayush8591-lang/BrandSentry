"""Identity, workspace and session management (Phase 2A).

All role assignments happen here, server-side, with no client-supplied role
input. Session tokens are cryptographically random, stored only as SHA-256
hashes, and are single-scope: an auth session is pinned to the workspace it
was created for.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import AuthSession, Membership, User, Workspace, new_id
from app.services.firebase import VerifiedIdentity

TOKEN_BYTES = 32  # 256-bit session and CSRF secrets


class GuestRateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__("guest session creation rate limit exceeded")


@dataclass(frozen=True)
class IssuedSession:
    session: AuthSession
    raw_token: str
    csrf_token: str


@dataclass(frozen=True)
class ActorWorkspace:
    user: User
    workspace: Workspace
    role: str


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def as_utc(value: datetime) -> datetime:
    """SQLite loses tzinfo; treat stored datetimes as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def csrf_matches(session: AuthSession, presented: str | None) -> bool:
    """Constant-time comparison of the presented CSRF token with the stored hash."""
    if not presented:
        return False
    return hmac.compare_digest(hash_token(presented), session.csrf_token_hash)


def _create_workspace_with_membership(
    db: Session, user: User, name: str, kind: str, role: str
) -> Workspace:
    workspace = Workspace(id=new_id("ws"), name=name, kind=kind)
    db.add(workspace)
    db.flush()
    membership = Membership(id=new_id("mem"), workspace_id=workspace.id, user_id=user.id, role=role)
    db.add(membership)
    return workspace


def get_or_create_google_user(db: Session, identity: VerifiedIdentity) -> ActorWorkspace:
    """Map a verified Firebase UID to the local account and personal workspace."""
    user = db.scalar(select(User).where(User.firebase_uid == identity.uid))
    if user is not None:
        membership = db.scalar(select(Membership).where(Membership.user_id == user.id))
        assert membership is not None, "google user must always own a membership"
        workspace = db.get(Workspace, membership.workspace_id)
        assert workspace is not None
        return ActorWorkspace(user=user, workspace=workspace, role=membership.role)

    display_name = identity.display_name or (
        identity.email.split("@")[0] if identity.email else "Google User"
    )
    user = User(
        id=new_id("usr"),
        firebase_uid=identity.uid,
        email=identity.email,
        display_name=display_name[:200],
        user_kind="google",
    )
    db.add(user)
    db.flush()
    workspace = _create_workspace_with_membership(
        db, user, name=f"{display_name[:100]}'s Workspace", kind="real", role="admin"
    )
    return ActorWorkspace(user=user, workspace=workspace, role="admin")


def _guest_rate_limit_retry_after(db: Session, ip: str | None, settings: Settings) -> int | None:
    """Seconds until another guest session may be created from this IP, or None."""
    limit = settings.guest_sessions_per_ip_per_hour
    if limit <= 0 or not ip:
        return None
    window_start = datetime.now(UTC) - timedelta(hours=1)
    conditions = (
        AuthSession.kind == "guest",
        AuthSession.ip == ip,
        AuthSession.created_at > window_start,
    )
    count = db.scalar(select(func.count()).select_from(AuthSession).where(*conditions)) or 0
    if count < limit:
        return None
    oldest = db.scalar(
        select(AuthSession).where(*conditions).order_by(AuthSession.created_at.asc()).limit(1)
    )
    assert oldest is not None
    retry_after = (
        as_utc(oldest.created_at) + timedelta(hours=1) - datetime.now(UTC)
    ).total_seconds()
    return max(1, int(retry_after) + 1)


def create_guest_session(
    db: Session, settings: Settings, ip: str | None, user_agent: str | None
) -> IssuedSession:
    """Create an isolated guest demo actor, demo workspace and short-lived session."""
    retry_after = _guest_rate_limit_retry_after(db, ip, settings)
    if retry_after is not None:
        raise GuestRateLimitExceeded(retry_after)

    user = User(
        id=new_id("usr"),
        firebase_uid=None,
        email=None,
        display_name="Guest Demo",
        user_kind="guest",
    )
    db.add(user)
    db.flush()
    workspace = _create_workspace_with_membership(
        db, user, name="Guest Demo Workspace", kind="demo", role="admin"
    )
    db.flush()
    issued = _issue_session(
        db,
        settings,
        user=user,
        workspace=workspace,
        kind="guest",
        ttl_hours=settings.guest_session_ttl_hours,
        ip=ip,
        user_agent=user_agent,
    )
    return issued


def _issue_session(
    db: Session,
    settings: Settings,
    *,
    user: User,
    workspace: Workspace,
    kind: str,
    ttl_hours: float,
    ip: str | None,
    user_agent: str | None,
) -> IssuedSession:
    raw_token = secrets.token_urlsafe(TOKEN_BYTES)
    csrf_token = secrets.token_urlsafe(TOKEN_BYTES)
    session = AuthSession(
        id=new_id("ses"),
        user_id=user.id,
        workspace_id=workspace.id,
        kind=kind,
        token_hash=hash_token(raw_token),
        csrf_token_hash=hash_token(csrf_token),
        ip=(ip or "")[:64] or None,
        user_agent=(user_agent or "")[:300] or None,
        expires_at=datetime.now(UTC) + timedelta(hours=ttl_hours),
    )
    db.add(session)
    db.commit()
    return IssuedSession(session=session, raw_token=raw_token, csrf_token=csrf_token)


def create_google_session(
    db: Session, settings: Settings, actor: ActorWorkspace, ip: str | None, user_agent: str | None
) -> IssuedSession:
    """Issue a fresh application session after successful Firebase verification.

    Always generates a new token (no client-supplied session identifiers),
    which prevents session fixation.
    """
    return _issue_session(
        db,
        settings,
        user=actor.user,
        workspace=actor.workspace,
        kind="google",
        ttl_hours=settings.user_session_ttl_hours,
        ip=ip,
        user_agent=user_agent,
    )


def resolve_session(db: Session, raw_token: str) -> AuthSession | None:
    """Return the live session for a raw token, or None (absent/revoked/expired)."""
    if not raw_token:
        return None
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(raw_token)))
    if session is None or session.revoked_at is not None:
        return None
    if as_utc(session.expires_at) <= datetime.now(UTC):
        return None
    return session


def load_actor(db: Session, session: AuthSession) -> ActorWorkspace | None:
    """Load user, workspace and role for a session; None if records vanished."""
    user = db.get(User, session.user_id)
    workspace = db.get(Workspace, session.workspace_id)
    if user is None or workspace is None:
        return None
    membership = db.scalar(
        select(Membership).where(
            Membership.workspace_id == workspace.id, Membership.user_id == user.id
        )
    )
    if membership is None:
        # A session must never outlive its membership (workspace isolation).
        return None
    return ActorWorkspace(user=user, workspace=workspace, role=membership.role)


def revoke_session(db: Session, session: AuthSession) -> None:
    """Revoke immediately; the token is unusable from this point on."""
    if session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        db.commit()
