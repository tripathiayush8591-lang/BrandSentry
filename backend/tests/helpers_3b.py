"""Shared Phase 3B validation test helpers.

Gemini is mocked ONLY at the provider boundary (a fake object installed on
``app.state.gemini_provider``); everything behind it is real: SQLite
persistence, FTS5 retrieval, the deterministic engine, cache/lease tables
and the HTTP layer. All content is synthetic.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Settings
from app.db.models import Membership
from app.main import create_app
from app.services.gemini import (
    AIAnalysis,
    GeminiResult,
    InvalidModelOutput,
    ProviderConfigError,
    ProviderError,
    ProviderRateLimited,
    ProviderTimeout,
)


def validation_settings(tmp_path: Path, **overrides: object) -> Settings:
    defaults: dict[str, object] = {
        "app_env": "development",
        "database_url": f"sqlite:///{(tmp_path / 'validation.sqlite').as_posix()}",
        "upload_dir": str(tmp_path / "uploads"),
        "frontend_origins": "http://localhost:5173,http://127.0.0.1:5173",
        "log_level": "WARNING",
        # Never let a locally configured GEMINI_API_KEY (ignored backend/.env)
        # turn an automated suite into live provider traffic: tests that need
        # a provider mock it at the boundary; HTTP-boundary tests pass their
        # own key explicitly with _env_file=None.
        "gemini_api_key": None,
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def make_client(settings: Settings):
    from contextlib import contextmanager

    @contextmanager
    def factory():
        with TestClient(create_app(settings)) as client:
            yield client

    return factory()


def guest_session(client: TestClient) -> dict[str, str]:
    """Create a guest session; returns CSRF header map for mutations."""
    response = client.post("/api/v1/auth/guest")
    assert response.status_code == 201, response.text
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def change_session_role(client: TestClient, role: str) -> None:
    me = client.get("/api/v1/auth/me").json()
    factory = client.app.state.session_factory
    with factory() as db:
        membership = db.scalar(
            select(Membership).where(
                Membership.workspace_id == me["workspace"]["id"],
                Membership.user_id == me["user"]["id"],
            )
        )
        assert membership is not None
        membership.role = role
        db.commit()


def ai_finding(
    *,
    category: str = "unsupported_claim",
    severity: str = "high",
    quote: str,
    explanation: str = "Potential unsupported claim.",
    suggested: str | None = None,
    claimed: list[str] | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "category": category,
        "severity": severity,
        "quote_or_range": quote,
        "explanation": explanation,
    }
    if suggested is not None:
        payload["suggested_text"] = suggested
    if claimed is not None:
        payload["claimed_source_ids"] = claimed
    if reason is not None:
        payload["needs_verification_reason"] = reason
    return payload


class FakeGeminiProvider:
    """Provider-boundary double: records calls, returns canned results/errors."""

    def __init__(
        self,
        findings: list[dict[str, Any]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.findings = findings or []
        self.error = error
        self.calls: list[dict[str, Any]] = []
        self.configured = True

    @property
    def is_configured(self) -> bool:
        return self.configured

    def analyze(
        self,
        *,
        content: str,
        evidence: list[dict[str, Any]],
        rules: list[dict[str, Any]],
        reserve_attempt: Any = None,
    ):
        # Mirror the real adapter contract: the caller's per-attempt budget
        # guard runs before the (mocked) provider I/O.
        if reserve_attempt is not None:
            reserve_attempt()
        self.calls.append({"content": content, "evidence": evidence, "rules": rules})
        if self.error is not None:
            raise self.error
        analysis = AIAnalysis.model_validate({"findings": self.findings})
        return GeminiResult(
            analysis=analysis,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            latency_ms=25,
        )


def install_fake_provider(client: TestClient, provider: FakeGeminiProvider) -> None:
    client.app.state.gemini_provider = provider


def create_submission(
    client: TestClient,
    headers: dict[str, str],
    *,
    title: str = "Launch copy",
    text: str = "Our product guarantees 100% results for everyone.",
) -> dict:
    response = client.post(
        "/api/v1/submissions", json={"title": title, "text": text}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def validate_version(
    client: TestClient,
    headers: dict[str, str],
    submission: dict,
    *,
    version_id: str | None = None,
    idempotency_key: str | None = None,
) -> object:
    body = {"content_version_id": version_id or submission["versions"][0]["id"]}
    extra_headers = dict(headers)
    if idempotency_key:
        extra_headers["Idempotency-Key"] = idempotency_key
    return client.post(
        f"/api/v1/submissions/{submission['id']}/validate", json=body, headers=extra_headers
    )


# Re-exported so test modules can raise provider errors without importing
# the adapter everywhere.
__all__ = [
    "InvalidModelOutput",
    "ProviderConfigError",
    "ProviderError",
    "ProviderRateLimited",
    "ProviderTimeout",
]
