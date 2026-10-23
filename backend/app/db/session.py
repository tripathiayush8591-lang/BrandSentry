"""SQLAlchemy engine and session management for SQLite.

Local development keeps the database under ``backend/.data/db/`` (git-ignored).
For Railway, mount a persistent volume at ``/data`` and set
``DATABASE_URL=sqlite:////data/db/brandsentry.sqlite``.

SQLite pragmas (foreign keys, busy timeout, WAL) are applied on every
connection as required by docs/ARCHITECTURE.md §E.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)

_BUSY_TIMEOUT_MS = 5000


def database_file_path(database_url: str) -> Path | None:
    """Best-effort filesystem path of a SQLite database URL (None if unknown)."""
    url = database_url
    if not url.startswith("sqlite:"):
        return None
    _, separator, raw = url.partition("sqlite:///")
    if not separator:  # e.g. "sqlite://" (in-memory) has no path part
        return None
    if not raw or raw == ":memory:" or raw.startswith("file:"):
        return None
    # Four slashes in `sqlite:////abs/path` leave a leading slash in `raw`
    # only for POSIX absolute paths; on Windows an absolute path looks like
    # `sqlite:///C:/...`. Resolve relative paths against the current dir.
    return Path(raw).resolve()


def ensure_database_dir(database_url: str) -> Path | None:
    """Create the parent directory of the SQLite file when possible."""
    db_path = database_file_path(database_url)
    if db_path is None:
        return None
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        # Do not crash startup: readiness will report the failure instead.
        logger.warning("Could not create database directory %s: %s", db_path.parent, exc)
        return None
    return db_path.parent


def _configure_sqlite_connection(dbapi_connection, _connection_record) -> None:  # noqa: ANN001
    """Apply required SQLite pragmas to each new connection."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
        except Exception:  # pragma: no cover - filesystems without WAL support
            logger.warning("WAL journal mode unavailable; falling back to default")
    finally:
        cursor.close()


def make_engine(database_url: str) -> Engine:
    """Build an engine for the configured database URL.

    The directory that will hold the SQLite file is created up front when
    possible so a fresh checkout works without manual steps.
    """
    ensure_database_dir(database_url)

    is_sqlite = database_url.startswith("sqlite:")
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False} if is_sqlite else {},
        poolclass=NullPool if is_sqlite else None,
    )
    if is_sqlite:
        event.listen(engine, "connect", _configure_sqlite_connection)
    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def check_database_connectivity(engine: Engine) -> tuple[bool, str | None]:
    """Cheap connectivity probe used by readiness; never raises."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:  # noqa: BLE001 - readiness must not blow up
        return False, f"{type(exc).__name__}: {exc}"


def check_storage_writable(database_url: str) -> tuple[bool, str | None]:
    """Verify the directory backing the SQLite file exists and is writable."""
    db_path = database_file_path(database_url)
    if db_path is None:
        return True, None
    directory = db_path.parent
    if not directory.is_dir():
        return False, f"database directory does not exist: {directory}"
    if not os.access(directory, os.W_OK):
        return False, f"database directory is not writable: {directory}"
    return True, None
