"""Authorisation, privilege-escalation and persistence checks for Phase 2A."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Settings
from app.db.models import AuthSession, Membership, User, Workspace
from app.main import create_app
from tests.helpers_2a import VALID_TOKEN, install_fake_verifier

SESSION_COOKIE = "brandsentry_session"


def test_unauthenticated_logout_is_401(client: TestClient) -> None:
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 401


def test_client_cannot_self_assign_roles_via_guest_body(client: TestClient) -> None:
    response = client.post("/api/v1/auth/guest", json={"role": "reviewer", "kind": "google"})
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "admin"  # server-decided demo workspace owner
    assert body["user"]["kind"] == "guest"
    assert body["workspace"]["kind"] == "demo"


def test_membership_isolation_in_database(client: TestClient, app) -> None:
    install_fake_verifier(client)
    client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN})
    client.cookies.clear()
    client.post("/api/v1/auth/guest")

    factory = app.state.session_factory
    with factory() as session:
        google_user = session.scalar(select(User).where(User.user_kind == "google"))
        guest_user = session.scalar(select(User).where(User.user_kind == "guest"))
        assert google_user is not None and guest_user is not None

        # Each actor holds exactly one membership, in their own workspace.
        memberships = session.scalars(select(Membership)).all()
        assert len(memberships) == 2
        for membership in memberships:
            owner = google_user if membership.user_id == google_user.id else guest_user
            workspace = session.get(Workspace, membership.workspace_id)
            assert workspace is not None
            expected_kind = "real" if owner.user_kind == "google" else "demo"
            assert workspace.kind == expected_kind

        # Guest accounts are not fake Firebase users.
        assert guest_user.firebase_uid is None
        assert google_user.firebase_uid == "google-uid-alpha"


def test_session_pinned_to_workspace(client: TestClient, app) -> None:
    created = client.post("/api/v1/auth/guest").json()
    factory = app.state.session_factory
    with factory() as session:
        auth_session = session.scalar(select(AuthSession))
        assert auth_session is not None
        # The session cannot migrate to another workspace after creation.
        assert auth_session.workspace_id == created["workspace"]["id"]
        assert auth_session.kind == "guest"


def test_identity_and_workspace_survive_restart(tmp_path) -> None:
    """LIVE_BACKEND persistence: guest identity readable after full app restart."""
    settings = Settings(
        app_env="development",
        database_url=f"sqlite:///{(tmp_path / 'restart.sqlite').as_posix()}",
        log_level="WARNING",
    )
    with TestClient(create_app(settings)) as first:
        created = first.post("/api/v1/auth/guest").json()
        cookie = first.cookies.get(SESSION_COOKIE)
        assert cookie

    # Fresh app instance against the same SQLite file (simulated restart).
    with TestClient(create_app(settings)) as second:
        second.cookies.set(SESSION_COOKIE, cookie)
        me = second.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["user"]["id"] == created["user"]["id"]
        assert me.json()["workspace"]["id"] == created["workspace"]["id"]


def test_expired_guest_cookie_has_capped_max_age(client: TestClient) -> None:
    """Guest cookie lifetime never exceeds the guest session TTL."""
    response = client.post("/api/v1/auth/guest")
    set_cookie = response.headers["set-cookie"]
    # Guest TTL default 4h = 14400s; assert the cookie is capped near it.
    max_age_fragment = [part for part in set_cookie.split(";") if "Max-Age" in part]
    assert max_age_fragment
    max_age = int(max_age_fragment[0].split("=")[1])
    assert max_age <= 4 * 3600


@pytest.mark.parametrize(
    ("path", "method"),
    [("/api/v1/auth/logout", "post"), ("/api/v1/auth/guest/revoke", "post")],
)
def test_mutations_rejected_without_session(client: TestClient, path: str, method: str) -> None:
    response = getattr(client, method)(path)
    assert response.status_code == 401
