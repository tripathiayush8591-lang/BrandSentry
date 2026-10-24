"""Firebase Admin ID-token verification (Google sign-in only).

BrandSentry uses Firebase **only** to verify Google identity; the backend never
talks to Firestore or Firebase Storage. Verification is delegated to the
official Admin SDK, which checks signature (Google public keys), issuer,
audience (project ID), expiry and token structure. Nothing client-supplied
beyond the ID token itself is trusted — email/role/UID claims are read from the
verified token payload, never from request fields.

Credentials come from (first match wins):
1. ``FIREBASE_SERVICE_ACCOUNT_JSON``  — full service-account JSON in one env var
2. ``FIREBASE_SERVICE_ACCOUNT_FILE``  — path to a service-account file
3. Application Default Credentials (ADC), such as a platform identity or
   ``GOOGLE_APPLICATION_CREDENTIALS``. SDK 6.9 loads ADC lazily when creating
   its auth client, even for ID-token verification. Project ID alone is not
   sufficient in this implementation; initialize_app succeeding does not
   prove that verification is ready.

If initialization or a certificate fetch fails, the verifier raises
``FirebaseNotConfiguredError``; ``/auth/google`` returns an honest 503 instead
of silently skipping verification.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass

from app.config import Settings

logger = logging.getLogger(__name__)

_INIT_LOCK = threading.Lock()

# BrandSentry accepts Google sign-in identities only (AGENTS.md: Firebase is
# used *only* for Google sign-in). The claim comes from the SDK-verified
# token payload, never from any client-supplied field, so password, phone,
# anonymous, custom-token and federated non-Google identities are rejected.
ALLOWED_SIGN_IN_PROVIDER = "google.com"


class FirebaseNotConfiguredError(Exception):
    """Raised when no Admin SDK credentials are available."""


class FirebaseTokenInvalidError(Exception):
    """Raised for any invalid/expired/malformed/wrong-project ID token."""


@dataclass(frozen=True)
class VerifiedIdentity:
    """Claims extracted from a successfully verified Firebase ID token."""

    uid: str
    email: str | None
    display_name: str | None


class FirebaseVerifier:
    """Thin wrapper around firebase_admin.auth with a mockable surface."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._initialized = False
        self._init_error: str | None = None

    # -- initialisation --------------------------------------------------------
    def _ensure_app(self) -> None:
        """Initialise the Firebase Admin app exactly once per process."""
        if self._initialized:
            return
        with _INIT_LOCK:
            if self._initialized:
                return

            import firebase_admin
            from firebase_admin import credentials

            project_id = self._settings.firebase_project_id

            def _finish(cred: credentials.BaseCredential | None) -> None:
                options = {"projectId": project_id}
                try:
                    if cred is None:
                        # The SDK defaults to ADC. Credential loading is lazy:
                        # the auth client still requires ADC on first use.
                        firebase_admin.initialize_app(options=options)
                    else:
                        firebase_admin.initialize_app(cred, options)
                except ValueError as exc:
                    # Already initialized in this process (e.g. another
                    # instance): only reuse it when it targets OUR project,
                    # otherwise verification would check the wrong audience.
                    if "already exists" in str(exc):
                        existing = firebase_admin.get_app()
                        if existing.project_id != project_id:
                            raise FirebaseNotConfiguredError(
                                "Firebase default app is initialised for a different project"
                            ) from exc
                    else:
                        raise
                self._initialized = True

            raw_json = self._settings.firebase_service_account_json
            if raw_json and raw_json.strip():
                _finish(credentials.Certificate(json.loads(raw_json)))
                return

            file_path = self._settings.firebase_service_account_file
            if file_path and file_path.strip():
                _finish(credentials.Certificate(file_path.strip()))
                return

            _finish(None)

    # -- verification ----------------------------------------------------------
    def verify(self, id_token: str) -> VerifiedIdentity:
        """Verify a Firebase ID token or raise FirebaseTokenInvalidError.

        Raises FirebaseNotConfiguredError when the Admin SDK cannot be
        initialised or reached; the API maps that to an honest 503.
        """
        try:
            self._ensure_app()
        except FirebaseNotConfiguredError:
            raise
        except Exception as exc:  # noqa: BLE001 - bad credentials must be 503, not 500
            raise FirebaseNotConfiguredError(
                f"Firebase Admin initialisation failed: {type(exc).__name__}"
            ) from exc

        from firebase_admin import auth

        try:
            decoded: dict = auth.verify_id_token(id_token)
        except auth.ExpiredIdTokenError as exc:
            raise FirebaseTokenInvalidError("expired token") from exc
        except auth.RevokedIdTokenError as exc:
            raise FirebaseTokenInvalidError("revoked token") from exc
        except auth.InvalidIdTokenError as exc:
            # Covers bad signature, wrong audience/issuer (wrong project),
            # malformed structure and future timestamps.
            raise FirebaseTokenInvalidError(f"invalid token: {exc.code}") from exc
        except ValueError as exc:
            raise FirebaseTokenInvalidError("malformed token") from exc
        except Exception as exc:  # noqa: BLE001 - network/cert fetch failures
            # Certificate fetch / connectivity problems are dependency
            # failures, not authentication outcomes.
            raise FirebaseNotConfiguredError(
                f"token verification unavailable: {type(exc).__name__}"
            ) from exc

        uid = decoded.get("uid") or decoded.get("sub")
        if not uid or not isinstance(uid, str):
            raise FirebaseTokenInvalidError("token missing subject")
        # `firebase` sign-in provider check on the SDK-verified payload:
        # accept exactly google.com — never password, phone, anonymous,
        # custom-token or other federated providers, and never a provider
        # name supplied by the client outside the verified token.
        firebase_claim = decoded.get("firebase")
        provider = (
            firebase_claim.get("sign_in_provider") if isinstance(firebase_claim, dict) else None
        )
        if provider != ALLOWED_SIGN_IN_PROVIDER:
            raise FirebaseTokenInvalidError(
                "token was not issued by Google sign-in; only Google identities are permitted"
            )

        email = decoded.get("email")
        name = decoded.get("name")
        return VerifiedIdentity(
            uid=uid,
            email=email if isinstance(email, str) and email else None,
            display_name=name if isinstance(name, str) and name else None,
        )


def build_verifier(settings: Settings) -> FirebaseVerifier:
    """Create the process verifier; defer SDK initialisation to first use."""
    return FirebaseVerifier(settings)
