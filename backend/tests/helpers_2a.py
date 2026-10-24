"""Shared Phase 2A test helpers.

Firebase is mocked at the verifier boundary (MOCK provider coverage): unit
tests exercise the backend's token-verification handling, UID mapping and
error translation without calling Google. Real Firebase verification is only
exercisable in a LIVE_PROVIDER deployment check with real credentials.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.firebase import FirebaseTokenInvalidError, VerifiedIdentity

VALID_TOKEN = "fake-valid-firebase-id-token"
EXPIRED_TOKEN = "fake-expired-firebase-id-token"
WRONG_PROJECT_TOKEN = "fake-wrong-project-firebase-id-token"
MALFORMED_TOKEN = "not-a-real-jwt-value"


class FakeGoogleVerifier:
    """Mock provider boundary: deterministic token -> identity mapping."""

    def __init__(self) -> None:
        self._identities: dict[str, VerifiedIdentity] = {}

    def register(
        self, id_token: str, uid: str, email: str | None = None, name: str | None = None
    ) -> None:
        self._identities[id_token] = VerifiedIdentity(uid=uid, email=email, display_name=name)

    def verify(self, id_token: str) -> VerifiedIdentity:
        identity = self._identities.get(id_token)
        if identity is not None:
            return identity
        if id_token == EXPIRED_TOKEN:
            raise FirebaseTokenInvalidError("expired token")
        if id_token == WRONG_PROJECT_TOKEN:
            # The real SDK raises InvalidIdTokenError for an audience/issuer
            # mismatch; the backend maps any of these to 401.
            raise FirebaseTokenInvalidError("invalid token: INVALID_AUDIENCE")
        raise FirebaseTokenInvalidError("malformed token")


def install_fake_verifier(client: TestClient) -> FakeGoogleVerifier:
    fake = FakeGoogleVerifier()
    fake.register(VALID_TOKEN, uid="google-uid-alpha", email="alpha@example.com", name="Alpha One")
    fake.register(
        "second-user-token", uid="google-uid-beta", email="beta@example.com", name="Beta Two"
    )
    client.app.state.firebase_verifier = fake  # type: ignore[union-attr]
    return fake


def make_custom_client(settings: Settings) -> TestClient:
    """TestClient with explicit Settings (used for rate-limit configuration)."""
    app = create_app(settings)
    return TestClient(app)
