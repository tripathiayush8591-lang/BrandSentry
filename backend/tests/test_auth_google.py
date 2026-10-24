"""Google sign-in: Firebase ID token verification boundary (MOCK provider)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.helpers_2a import (
    EXPIRED_TOKEN,
    MALFORMED_TOKEN,
    VALID_TOKEN,
    WRONG_PROJECT_TOKEN,
    install_fake_verifier,
)


@pytest.fixture()
def google_client(client: TestClient) -> TestClient:
    install_fake_verifier(client)
    return client


def test_valid_token_establishes_identity_and_workspace(google_client: TestClient) -> None:
    response = google_client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN})
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["kind"] == "google"
    assert body["user"]["email"] == "alpha@example.com"
    assert body["user"]["display_name"] == "Alpha One"
    assert body["workspace"]["kind"] == "real"
    assert body["role"] == "admin"  # server-assigned workspace owner
    assert body["session"]["kind"] == "google"
    assert body["csrf_token"]

    # Session cookie: HttpOnly always; in development SameSite=Lax, no Secure.
    set_cookie = response.headers["set-cookie"]
    assert "brandsentry_session=" in set_cookie
    assert "httponly" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()
    assert "secure" not in set_cookie.lower()


def test_same_uid_maps_to_same_local_account(google_client: TestClient) -> None:
    first = google_client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN}).json()
    second = google_client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN}).json()
    assert second["user"]["id"] == first["user"]["id"]
    assert second["workspace"]["id"] == first["workspace"]["id"]
    # A fresh session is issued each login (anti-fixation), with a new token.
    assert first["csrf_token"] != second["csrf_token"]


def test_invalid_malformed_and_wrong_project_tokens_rejected(google_client: TestClient) -> None:
    for token in (MALFORMED_TOKEN, WRONG_PROJECT_TOKEN):
        response = google_client.post("/api/v1/auth/google", json={"id_token": token})
        assert response.status_code == 401, token
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_expired_token_rejected(google_client: TestClient) -> None:
    response = google_client.post("/api/v1/auth/google", json={"id_token": EXPIRED_TOKEN})
    assert response.status_code == 401
    assert "expired" in response.json()["error"]["message"].lower()


def test_client_cannot_inject_email_role_or_uid(google_client: TestClient) -> None:
    response = google_client.post(
        "/api/v1/auth/google",
        json={
            "id_token": VALID_TOKEN,
            "email": "attacker@evil.example",
            "role": "reviewer",
            "uid": "google-uid-beta",
        },
    )
    assert response.status_code == 200
    body = response.json()
    # Identity fields come from verified token claims only.
    assert body["user"]["email"] == "alpha@example.com"
    assert body["user"]["id"] != "google-uid-beta"
    assert body["role"] == "admin"


def test_second_google_user_gets_isolated_workspace(google_client: TestClient) -> None:
    first = google_client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN}).json()
    second = google_client.post(
        "/api/v1/auth/google", json={"id_token": "second-user-token"}
    ).json()
    assert first["user"]["id"] != second["user"]["id"]
    assert first["workspace"]["id"] != second["workspace"]["id"]


def test_unconfigured_firebase_returns_honest_503(client: TestClient) -> None:
    # Default test app has a real verifier that needs credentials and network;
    # simulate the explicit unavailable outcome instead of
    # depending on network access in unit tests.
    class UnreachableVerifier:
        def verify(self, id_token: str):
            from app.services.firebase import FirebaseNotConfiguredError

            raise FirebaseNotConfiguredError("token verification unavailable")

    client.app.state.firebase_verifier = UnreachableVerifier()  # type: ignore[union-attr]
    response = client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


def test_project_id_only_initializes_but_verification_requires_adc(client, monkeypatch) -> None:
    """Real SDK initialization/auth-client path, mocked ADC failure; no network."""
    import firebase_admin
    import google.auth
    from google.auth.exceptions import DefaultCredentialsError

    from app.config import Settings
    from app.services.firebase import FirebaseNotConfiguredError, FirebaseVerifier

    # Isolate the SDK registry from any other app/test in this process.
    monkeypatch.setattr(firebase_admin, "_apps", {})
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST", raising=False)

    def missing_adc(*args, **kwargs):
        raise DefaultCredentialsError("ADC unavailable in test")

    monkeypatch.setattr(google.auth, "default", missing_adc)
    verifier = FirebaseVerifier(
        Settings(
            _env_file=None,
            firebase_project_id="brandsentry-68d05",
            firebase_service_account_json=None,
            firebase_service_account_file=None,
        )
    )
    try:
        verifier._ensure_app()
        assert firebase_admin.get_app().project_id == "brandsentry-68d05"
        with pytest.raises(FirebaseNotConfiguredError) as caught:
            verifier.verify(MALFORMED_TOKEN)
        assert isinstance(caught.value.__cause__, DefaultCredentialsError)

        client.app.state.firebase_verifier = verifier
        response = client.post("/api/v1/auth/google", json={"id_token": MALFORMED_TOKEN})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
        assert not response.headers.get_list("set-cookie")
        assert client.get("/api/v1/auth/me").status_code == 401
    finally:
        firebase_admin.delete_app(firebase_admin.get_app())


def test_missing_id_token_is_validation_error(google_client: TestClient) -> None:
    response = google_client.post("/api/v1/auth/google", json={})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_broken_firebase_credentials_return_503(tmp_path) -> None:
    # Malformed service-account JSON must degrade to an honest 503, never 500.
    from app.config import Settings
    from app.main import create_app

    settings = Settings(
        app_env="development",
        database_url=f"sqlite:///{(tmp_path / 'bad_firebase.sqlite').as_posix()}",
        log_level="WARNING",
        firebase_service_account_json="{not valid json",
    )
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


def test_verify_accepts_only_google_sign_in_provider(monkeypatch) -> None:
    """Phase 4B regression (audit blocker 2): after real SDK verification,
    only sign_in_provider == google.com is accepted. Password, phone,
    anonymous, custom and federated non-Google identities are rejected; the
    provider claim is read from the verified token, never from the client."""
    from firebase_admin import auth as fb_auth

    from app.config import Settings
    from app.services.firebase import FirebaseTokenInvalidError, FirebaseVerifier

    verifier = FirebaseVerifier(Settings(_env_file=None, firebase_project_id="brandsentry-68d05"))
    monkeypatch.setattr(verifier, "_ensure_app", lambda: None)

    def install(decoded: dict) -> None:
        monkeypatch.setattr(fb_auth, "verify_id_token", lambda token: decoded)

    # A genuine Google sign-in token (verified payload) is accepted.
    install({"uid": "google-uid-gamma", "firebase": {"sign_in_provider": "google.com"}})
    identity = verifier.verify("synthetic-token")
    assert identity.uid == "google-uid-gamma"

    for disallowed in ("password", "phone", "anonymous", "custom", "github.com", "", "Google.com"):
        install({"uid": "google-uid-gamma", "firebase": {"sign_in_provider": disallowed}})
        with pytest.raises(FirebaseTokenInvalidError):
            verifier.verify("synthetic-token")

    # Missing/empty firebase claim: rejected as well.
    install({"uid": "google-uid-gamma"})
    with pytest.raises(FirebaseTokenInvalidError):
        verifier.verify("synthetic-token")
    install({"uid": "google-uid-gamma", "firebase": {}})
    with pytest.raises(FirebaseTokenInvalidError):
        verifier.verify("synthetic-token")


def test_default_app_reuse_validates_project(monkeypatch) -> None:
    """Phase 4B regression: reusing the SDK default app ('already exists')
    must verify the existing app targets OUR project, never silently accept
    a default app initialised for a different project."""
    import firebase_admin

    from app.config import Settings
    from app.services.firebase import FirebaseNotConfiguredError, FirebaseVerifier

    class _ExistingApp:
        project_id = "another-project"

    def _already(*args: object, **kwargs: object) -> None:
        raise ValueError("The default Firebase app already exists.")

    monkeypatch.setattr(firebase_admin, "initialize_app", _already)
    monkeypatch.setattr(firebase_admin, "get_app", lambda *a, **k: _ExistingApp())
    verifier = FirebaseVerifier(Settings(_env_file=None, firebase_project_id="brandsentry-68d05"))
    with pytest.raises(FirebaseNotConfiguredError):
        verifier._ensure_app()

    # A matching default app is legitimately reused.
    class _MatchingApp:
        project_id = "brandsentry-68d05"

    monkeypatch.setattr(firebase_admin, "get_app", lambda *a, **k: _MatchingApp())
    matching = FirebaseVerifier(Settings(_env_file=None, firebase_project_id="brandsentry-68d05"))
    matching._ensure_app()
    assert matching._initialized
