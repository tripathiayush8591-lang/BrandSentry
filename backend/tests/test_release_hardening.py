"""Phase 4C release-hardening regressions.

Covers the remaining Phase 4A production blockers: the private no-store cache
policy on every response, early request-body limits enforced before
buffering, rightmost-entry ``X-Forwarded-For`` semantics for per-IP limits,
upload-directory readiness, the fail-closed production storage check, and the
duplicate-title 409 mapping. All provider boundaries stay mocked; no live
Gemini/Firebase traffic.
"""

from __future__ import annotations

import pathlib
import sys
import tempfile

import pytest
from starlette.requests import Request

from app.api.deps import get_client_ip
from app.config import Settings
from app.main import create_app
from tests.helpers_3b import guest_session, make_client, validation_settings


def tmp() -> pathlib.Path:
    return pathlib.Path(tempfile.mkdtemp())


# --- private cache policy -----------------------------------------------------


def test_every_response_is_private_no_store() -> None:
    with make_client(validation_settings(tmp())) as client:
        # Success, JSON error, and cookie-issuing responses alike.
        responses = [
            client.get("/health"),
            client.get("/ready"),
            client.get("/api/v1/auth/me"),  # 401 JSON error
            client.get("/api/v1/definitely-not-a-route"),  # 404 JSON error
            client.post("/api/v1/auth/guest"),  # Set-Cookie issuance
        ]
        for response in responses:
            assert response.headers.get("cache-control") == "private, no-store", (
                f"{response.request.url} -> {response.status_code}"
            )


# --- early request-body limits -------------------------------------------------


def test_oversize_content_length_rejected_before_the_app_runs() -> None:
    settings = validation_settings(tmp(), knowledge_max_upload_bytes=64)
    with make_client(settings) as client:
        # No session cookie: if the endpoint ran, this would be 401. The 413
        # proves the middleware rejected it from headers alone, pre-buffering.
        response = client.post(
            "/api/v1/knowledge/documents",
            headers={
                "Content-Type": "multipart/form-data; boundary=bs",
                "Content-Length": "99999999",
            },
        )
        assert response.status_code == 413, response.text
        assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_oversize_json_body_rejected_with_413() -> None:
    with make_client(validation_settings(tmp())) as client:
        body = b'{"id_token": "' + b"a" * (256 * 1024 + 1) + b'"}'
        response = client.post(
            "/api/v1/auth/google", content=body, headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 413, response.text
        assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_chunked_body_over_limit_aborts_with_413() -> None:
    with make_client(validation_settings(tmp())) as client:

        def chunks():
            # Stream ~300 KiB without a Content-Length header (chunked), past
            # the 256 KiB JSON cap.
            for _ in range(300):
                yield b"x" * 1024

        response = client.post(
            "/api/v1/auth/google",
            content=chunks(),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413, response.text


def test_normal_sized_requests_still_succeed() -> None:
    with make_client(validation_settings(tmp())) as client:
        response = client.post("/api/v1/auth/guest", json={})
        assert response.status_code == 201, response.text


# --- forwarded client IP (rate-limit identity) ----------------------------------


def _request_with_xff(value: str | None) -> Request:
    headers = []
    if value:
        headers.append((b"x-forwarded-for", value.encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "headers": headers,
        "client": ("10.0.0.1", 12345),
    }
    return Request(scope)


def test_forwarded_ip_uses_rightmost_proxy_entry() -> None:
    # The trusted edge proxy appends the real client address last; spoofed
    # entries appear earlier and must be ignored.
    assert get_client_ip(_request_with_xff("1.2.3.4, 9.9.9.9")) == "9.9.9.9"
    assert get_client_ip(_request_with_xff("1.2.3.4")) == "1.2.3.4"
    assert get_client_ip(_request_with_xff(None)) == "10.0.0.1"


def test_spoofed_forwarded_header_cannot_bypass_guest_limit() -> None:
    settings = validation_settings(tmp(), guest_sessions_per_ip_per_hour=2)
    with make_client(settings) as client:
        for _ in range(2):
            response = client.post(
                "/api/v1/auth/guest", headers={"X-Forwarded-For": "1.2.3.4, 9.9.9.9"}
            )
            assert response.status_code == 201, response.text
        # Same rightmost victim IP, different spoofed prefixes: still limited.
        response = client.post(
            "/api/v1/auth/guest", headers={"X-Forwarded-For": "5.6.7.8, 9.9.9.9"}
        )
        assert response.status_code == 429, response.text
        # A different real (rightmost) client is unaffected by the spoof.
        response = client.post(
            "/api/v1/auth/guest", headers={"X-Forwarded-For": "1.2.3.4, 8.8.8.8"}
        )
        assert response.status_code == 201, response.text


# --- storage readiness and fail-closed production paths -------------------------


def test_ready_checks_upload_directory_writability() -> None:
    base = tmp()
    blocker = base / "blocker.txt"
    blocker.write_text("a file, not a directory")
    settings = validation_settings(tmp(), upload_dir=str(blocker / "uploads"))
    with make_client(settings) as client:
        response = client.get("/ready")
        assert response.status_code == 503, response.text
        checks = response.json()["checks"]
        assert checks["uploads"]["ok"] is False


def test_ready_reports_healthy_uploads_directory() -> None:
    with make_client(validation_settings(tmp())) as client:
        response = client.get("/ready")
        assert response.status_code == 200, response.text
        assert response.json()["checks"]["uploads"]["ok"] is True


def test_production_storage_path_validation() -> None:
    relative = Settings(
        app_env="production",
        database_url="sqlite:///./x.db",
        upload_dir="./uploads",
        _env_file=None,
    )
    problems = relative.production_storage_problems()
    assert len(problems) == 2

    volume = Settings(
        app_env="production",
        database_url="sqlite:////data/db/brandsentry.sqlite",
        upload_dir="/data/uploads",
        _env_file=None,
    )
    assert volume.production_storage_problems() == []

    development = Settings(
        app_env="development",
        database_url="sqlite:///./x.db",
        upload_dir="./uploads",
        _env_file=None,
    )
    assert development.production_storage_problems() == []


def test_production_with_relative_storage_paths_fails_closed() -> None:
    settings = validation_settings(tmp(), app_env="production")
    with pytest.raises(RuntimeError, match="durable storage"):
        create_app(settings)


@pytest.mark.skipif(
    sys.platform == "win32",
    reason="POSIX-absolute volume paths are not constructible on Windows hosts",
)
def test_production_with_volume_paths_starts() -> None:
    base = tmp()
    settings = validation_settings(
        base,
        app_env="production",
        database_url=f"sqlite:////{base / 'prod.sqlite'}",
        upload_dir=f"/{base / 'uploads'}",
    )
    assert settings.production_storage_problems() == []
    with make_client(settings) as client:
        assert client.get("/ready").status_code == 200


# --- duplicate submission title maps to 409 -------------------------------------


def test_duplicate_submission_title_returns_409() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        first = client.post(
            "/api/v1/submissions",
            json={"title": "Same Title", "text": "Version one text."},
            headers=headers,
        )
        assert first.status_code == 201, first.text
        second = client.post(
            "/api/v1/submissions",
            json={"title": "Same Title", "text": "Different text."},
            headers=headers,
        )
        assert second.status_code == 409, second.text
        assert second.json()["error"]["code"] == "CONFLICT"
