"""Consistent JSON error contract and request-ID propagation on failures."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_unknown_route_returns_error_contract(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_method_not_allowed_uses_error_contract(client: TestClient) -> None:
    response = client.post("/health")
    assert response.status_code == 405
    error = response.json()["error"]
    assert error["code"] == "METHOD_NOT_ALLOWED"
    assert error["request_id"]


def test_validation_error_contract_does_not_echo_input(settings) -> None:
    app = create_app(settings)

    @app.get("/_test/echo")
    def _echo(count: int) -> int:
        return count

    with TestClient(app) as test_client:
        response = test_client.get("/_test/echo", params={"count": "not-a-number"})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    # Raw user input must not be reflected back in the error message.
    assert "not-a-number" not in error["message"]
    assert error["request_id"]
