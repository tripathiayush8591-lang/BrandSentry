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
        frontend_origins="http://localhost:5173,http://127.0.0.1:5173",
        log_level="WARNING",
    )


@pytest.fixture()
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture()
def client(app) -> TestClient:
    # Context manager form so the lifespan (engine setup) actually runs.
    with TestClient(app) as test_client:
        yield test_client
