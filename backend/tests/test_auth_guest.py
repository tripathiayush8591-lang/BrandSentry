"""Guest demo sessions: creation, isolation, expiry, revocation, rate limiting."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from http.cookies import SimpleCookie

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.helpers_2a import VALID_TOKEN, install_fake_verifier

SESSION_COOKIE = "brandsentry_session"


@pytest.mark.parametrize("app_env", ["development", "production"])
@pytest.mark.parametrize("cookie_name", [SESSION_COOKIE, "custom_session"])
@pytest.mark.parametrize(
    ("kind", "endpoint"),
    [("guest", "/auth/logout"), ("google", "/auth/logout"), ("guest", "/auth/guest/revoke")],
)
def test_revocation_deletes_matching_cookies_and_blocks_replay(
    tmp_path, app_env: str, cookie_name: str, kind: str, endpoint: str
) -> None:
    """LIVE SQLite/backend; Google identity mocked, HTTPS cookie transport simulated."""
    settings = Settings(
        app_env=app_env,
        session_cookie_name=cookie_name,
        database_url=f"sqlite:///{(tmp_path / 'logout.sqlite').as_posix()}",
        log_level="WARNING",
        # This test simulates production cookie/HTTPS behaviour on local tmp
        # paths; the durable-storage startup check is covered separately
        # (tests/test_release_hardening.py).
        enforce_production_storage_paths=False,
    )
    with TestClient(create_app(settings), base_url="https://testserver") as client:
        install_fake_verifier(client)
        login = client.post(
            f"/api/v1/auth/{kind}",
            **({"json": {"id_token": VALID_TOKEN}} if kind == "google" else {}),
        )
        assert login.status_code == (200 if kind == "google" else 201)
        captured_cookie = client.cookies.get(cookie_name)
        assert captured_cookie
        issued = SimpleCookie()
        for header in login.headers.get_list("set-cookie"):
            issued.load(header)
        assert client.get("/api/v1/workspaces/current").status_code == 200

        response = client.post(
            f"/api/v1{endpoint}", headers={"X-CSRF-Token": login.json()["csrf_token"]}
        )
        assert response.status_code == 204
        assert response.content == b""
        headers = response.headers.get_list("set-cookie")
        assert len(headers) == 2
        deleted = SimpleCookie()
        for header in headers:
            deleted.load(header)
        assert set(deleted) == {cookie_name, f"{cookie_name}-csrf"}
        for name, cookie in deleted.items():
            assert cookie.value == ""
            assert cookie["max-age"] == "0"
            assert parsedate_to_datetime(cookie["expires"]) <= datetime.now(UTC)
            for attr in ("path", "domain", "secure", "httponly", "samesite"):
                assert cookie[attr] == issued[name][attr]
            assert cookie["path"] == "/"
            assert cookie["domain"] == ""
            assert bool(cookie["secure"]) == (app_env == "production")
            assert bool(cookie["httponly"]) == (name == cookie_name)
            assert cookie["samesite"] == ("none" if app_env == "production" else "lax")
        assert client.cookies.get(cookie_name) is None
        assert client.cookies.get(f"{cookie_name}-csrf") is None

        # Raw replay bypasses cookie-jar removal to prove server revocation.
        for path in ("/auth/me", "/workspaces/current"):
            replay = client.get(
                f"/api/v1{path}", headers={"Cookie": f"{cookie_name}={captured_cookie}"}
            )
            assert replay.status_code == 401
            assert replay.json()["error"]["code"] == "UNAUTHENTICATED"

    # Revocation is persisted, including after rebuilding the app/DB engine.
    with TestClient(create_app(settings), base_url="https://testserver") as restarted:
        replay = restarted.get(
            "/api/v1/auth/me", headers={"Cookie": f"{cookie_name}={captured_cookie}"}
        )
        assert replay.status_code == 401


def test_guest_session_created_without_firebase(client: TestClient) -> None:
    response = client.post("/api/v1/auth/guest")
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["kind"] == "guest"
    assert body["user"]["email"] is None  # no personal information to expose
    assert body["workspace"]["kind"] == "demo"
    assert body["role"] == "admin"
    assert body["session"]["kind"] == "guest"
    set_cookie = response.headers["set-cookie"]
    assert f"{SESSION_COOKIE}=" in set_cookie
    assert f"{SESSION_COOKIE}-csrf=" in set_cookie
    assert "httponly" in set_cookie.lower()


def test_guest_me_roundtrip_and_workspace(client: TestClient) -> None:
    created = client.post("/api/v1/auth/guest").json()
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["id"] == created["user"]["id"]
    assert body["workspace"]["id"] == created["workspace"]["id"]

    ws = client.get("/api/v1/workspaces/current")
    assert ws.status_code == 200
    assert ws.json()["workspace"]["kind"] == "demo"
    assert ws.json()["role"] == "admin"


def test_guest_sessions_are_isolated(client: TestClient) -> None:
    first = client.post("/api/v1/auth/guest").json()
    # Drop the first cookie, become a different guest.
    client.cookies.clear()
    second = client.post("/api/v1/auth/guest").json()
    assert first["user"]["id"] != second["user"]["id"]
    assert first["workspace"]["id"] != second["workspace"]["id"]


def test_guest_isolated_from_google_workspaces(client: TestClient) -> None:
    install_fake_verifier(client)
    google = client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN}).json()
    client.cookies.clear()
    guest = client.post("/api/v1/auth/guest").json()
    assert guest["workspace"]["id"] != google["workspace"]["id"]
    # The session is pinned to its own workspace; /workspaces/current takes no
    # parameter that could redirect it at another workspace.
    ws = client.get("/api/v1/workspaces/current")
    assert ws.json()["workspace"]["id"] == guest["workspace"]["id"]


def test_logout_revokes_and_replay_fails(client: TestClient) -> None:
    created = client.post("/api/v1/auth/guest").json()
    captured_cookie = client.cookies.get(SESSION_COOKIE)
    assert captured_cookie

    assert (
        client.post(
            "/api/v1/auth/logout", headers={"X-CSRF-Token": created["csrf_token"]}
        ).status_code
        == 204
    )

    # Replaying the revoked token from a captured cookie must fail.
    client.cookies.set(SESSION_COOKIE, captured_cookie)
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401
    assert me.json()["error"]["code"] == "UNAUTHENTICATED"


def test_logout_requires_csrf_token(client: TestClient) -> None:
    client.post("/api/v1/auth/guest")
    assert client.post("/api/v1/auth/logout").status_code == 403
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "wrong"}).status_code == 403
    # The session survives failed CSRF attempts.
    assert client.get("/api/v1/auth/me").status_code == 200


def test_guest_revoke_rejects_google_session(client: TestClient) -> None:
    install_fake_verifier(client)
    created = client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN}).json()
    response = client.post(
        "/api/v1/auth/guest/revoke", headers={"X-CSRF-Token": created["csrf_token"]}
    )
    assert response.status_code == 403
    assert client.get("/api/v1/auth/me").status_code == 200


def test_guest_revoke_revokes_guest_session(client: TestClient) -> None:
    created = client.post("/api/v1/auth/guest").json()
    assert (
        client.post(
            "/api/v1/auth/guest/revoke", headers={"X-CSRF-Token": created["csrf_token"]}
        ).status_code
        == 204
    )
    assert client.get("/api/v1/auth/me").status_code == 401


def test_expired_session_is_rejected(client: TestClient, app) -> None:
    client.post("/api/v1/auth/guest")
    # Force expiry directly in the database (LIVE SQLite backend).
    factory = app.state.session_factory
    from app.db.models import AuthSession

    with factory() as session:
        auth_session = session.query(AuthSession).first()
        assert auth_session is not None
        auth_session.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401


def test_guest_creation_rate_limited(tmp_path) -> None:
    settings = Settings(
        app_env="development",
        database_url=f"sqlite:///{(tmp_path / 'rate_limit.sqlite').as_posix()}",
        log_level="WARNING",
        guest_sessions_per_ip_per_hour=3,
    )
    with TestClient(create_app(settings)) as client:
        for _ in range(3):
            assert client.post("/api/v1/auth/guest").status_code == 201
        limited = client.post("/api/v1/auth/guest")
        assert limited.status_code == 429
        assert limited.json()["error"]["code"] == "RATE_LIMITED"
        assert int(limited.headers["Retry-After"]) > 0
        # Rate limiting blocks new sessions, not use of an existing one.
        assert client.get("/api/v1/auth/me").status_code == 200


def test_disallowed_origin_rejected_for_guest_creation(client: TestClient) -> None:
    response = client.post("/api/v1/auth/guest", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize("path", ["/api/v1/auth/me", "/api/v1/workspaces/current"])
def test_protected_routes_reject_unauthenticated(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
