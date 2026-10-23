"""GET /ready — SQLite connectivity + writable storage, honest 503 on failure."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_ready_when_database_available(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"]["ok"] is True
    assert body["checks"]["storage"]["ok"] is True
    assert body["request_id"]


def test_ready_reports_503_when_database_unreachable(tmp_path) -> None:
    # A regular file occupying the parent path makes both directory creation
    # and SQLite file creation impossible -> readiness must degrade to 503.
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("occupied")
    broken = Settings(
        database_url=f"sqlite:///{(blocker / 'sub' / 'db.sqlite').as_posix()}",
        log_level="WARNING",
    )
    with TestClient(create_app(broken)) as test_client:
        response = test_client.get("/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"]["ok"] is False
    assert body["checks"]["database"]["detail"]
    assert body["checks"]["storage"]["ok"] is False
    assert body["request_id"]


def test_ready_creates_database_file_on_first_probe(client: TestClient, settings: Settings) -> None:
    # First successful readiness probe should materialise the SQLite file,
    # making fresh-checkout setup repeatable without manual steps.
    response = client.get("/ready")
    assert response.status_code == 200
    db_path = settings.database_url.split("sqlite:///", 1)[1]
    from pathlib import Path

    assert Path(db_path).exists()
