"""GET /health — cheap liveness, no dependency access."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "brandsentry-backend"
    assert body["request_id"] == response.headers["X-Request-ID"]


def test_health_generates_request_ids(client: TestClient) -> None:
    first = client.get("/health")
    second = client.get("/health")
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["request_id"].startswith("req_")
    assert second.json()["request_id"] != first.json()["request_id"]


def test_health_echoes_wellformed_client_request_id(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "req_from-client-1"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req_from-client-1"
    assert response.json()["request_id"] == "req_from-client-1"


def test_health_replaces_unsafe_client_request_id(client: TestClient) -> None:
    # Header injection attempt must be rejected and replaced, never echoed.
    response = client.get("/health", headers={"X-Request-ID": "bad id\r\nX-Injected: 1"})
    assert response.status_code == 200
    echoed = response.headers["X-Request-ID"]
    assert echoed.startswith("req_") and "bad" not in echoed
    assert "X-Injected" not in response.headers


def test_health_works_even_when_database_is_broken(tmp_path) -> None:
    blocker = tmp_path / "blocker"
    blocker.write_text("occupied")
    broken = Settings(
        database_url=f"sqlite:///{(blocker / 'db.sqlite').as_posix()}",
        log_level="WARNING",
    )
    with TestClient(create_app(broken)) as test_client:
        response = test_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
