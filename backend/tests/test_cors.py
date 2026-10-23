"""CORS behaviour: environment-driven allow-list, no wildcard access."""

from __future__ import annotations

from fastapi.testclient import TestClient

ALLOWED = "http://localhost:5173"
ALLOWED_ALT = "http://127.0.0.1:5173"
DISALLOWED = "https://evil.example"


def test_allowed_origin_gets_cors_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": ALLOWED})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED


def test_disallowed_origin_gets_no_cors_headers(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": DISALLOWED})
    assert response.status_code == 200  # same-origin style plain response
    assert "access-control-allow-origin" not in response.headers


def test_preflight_allowed_for_allowlisted_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/status",
        headers={"Origin": ALLOWED_ALT, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ALT


def test_preflight_rejected_for_unknown_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/status",
        headers={"Origin": DISALLOWED, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_credentials_not_allowed_by_default(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": ALLOWED})
    assert response.headers.get("access-control-allow-credentials", "false").lower() != "true"
