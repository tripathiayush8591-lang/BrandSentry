"""Programmatic Alembic runner used at application startup.

The Railway volume is not mounted during build, so schema migrations run at a
controlled runtime step (docs/DEPLOYMENT_RUNBOOK.md §7). Failures are logged
and surfaced through /ready rather than crashing startup.
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]


def make_alembic_config(database_url: str) -> Config:
    alembic_dir = _BACKEND_DIR / "alembic.ini"
    config = Config(str(alembic_dir))
    config.set_main_option("script_location", str(_BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def run_migrations(database_url: str) -> bool:
    """Upgrade the database to head. Returns True on success."""
    try:
        command.upgrade(make_alembic_config(database_url), "head")
        return True
    except Exception as exc:  # noqa: BLE001 - startup must not crash on DB issues
        logger.error("Database migration failed: %s: %s", type(exc).__name__, exc)
        return False
