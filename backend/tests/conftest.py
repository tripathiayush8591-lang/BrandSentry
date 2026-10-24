"""Shared fixtures: isolated Settings/App/Client per test using temp SQLite files."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture()
def settings(tmp_path: pytest.TempPathFactory) -> Settings:
    return Settings(
        app_env="development",
        database_url=f"sqlite:///{(tmp_path / 'test.sqlite').as_posix()}",
        upload_dir=str(tmp_path / "uploads"),
        frontend_origins="http://localhost:5173,http://127.0.0.1:5173",
        log_level="WARNING",
        # Never let a locally configured GEMINI_API_KEY (ignored backend/.env)
        # turn an automated suite into live provider traffic.
        gemini_api_key=None,
    )


@pytest.fixture()
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture()
def client(app) -> TestClient:
    # Context manager form so the lifespan (engine setup) actually runs.
    with TestClient(app) as test_client:
        yield test_client
