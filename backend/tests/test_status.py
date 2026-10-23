"""GET /api/v1/status — structured backend availability payload."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_status_shape(client: TestClient) -> None:
    response = client.get("/api/v1/status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "brandsentry-backend"
    assert body["version"]
    assert body["environment"] == "development"
    assert body["api_version"] == "v1"
    assert "T" in body["time_utc"]  # ISO-8601 UTC timestamp
    assert body["request_id"] == response.headers["X-Request-ID"]


def test_status_reachable_under_v1_prefix_only(client: TestClient) -> None:
    assert client.get("/api/v1/status").status_code == 200
    assert client.get("/status").status_code == 404
    assert client.get("/api/v2/status").status_code == 404
