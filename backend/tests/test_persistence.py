"""SQLite write/read persistence on a temporary database file.

Integration-style test (LIVE SQLite file I/O, no network): proves sessions
write real rows and that data survives a full engine disposal/recreation,
which is the local analogue of a backend restart.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import DateTime, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.session import database_file_path, make_engine, make_session_factory


class PhaseSmokeRecord(Base):
    """Test-only table; Phase 1A intentionally ships no production entities."""

    __tablename__ = "phase1a_smoke_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    payload: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


def test_write_read_survives_engine_restart(tmp_path: Path) -> None:
    db_file = tmp_path / "persistence.sqlite"
    url = f"sqlite:///{db_file.as_posix()}"

    engine = make_engine(url)
    Base.metadata.create_all(engine)
    session_factory = make_session_factory(engine)
    with session_factory() as session:
        session.add(PhaseSmokeRecord(payload="phase-1a-persistence-proof"))
        session.commit()
    engine.dispose()

    # Simulated restart: brand-new engine and session against the same file.
    assert db_file.exists(), "SQLite database file should persist on disk"
    restarted_engine = make_engine(url)
    restarted_factory = make_session_factory(restarted_engine)
    with restarted_factory() as session:
        rows = session.query(PhaseSmokeRecord).order_by(PhaseSmokeRecord.id).all()
    assert [row.payload for row in rows] == ["phase-1a-persistence-proof"]
    restarted_engine.dispose()


def test_sqlite_connection_pragmas_applied(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'pragmas.sqlite').as_posix()}"
    engine = make_engine(url)
    try:
        with engine.connect() as connection:
            assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1
            assert connection.execute(text("PRAGMA busy_timeout")).scalar() == 5000
    finally:
        engine.dispose()


def test_database_directory_created_automatically(tmp_path: Path) -> None:
    nested = tmp_path / ".data" / "db" / "brandsentry.sqlite"
    url = f"sqlite:///{nested.as_posix()}"
    make_engine(url)
    with make_engine(url).connect() as connection:
        connection.execute(text("SELECT 1"))
    assert nested.exists()
    assert database_file_path(url) is not None


def test_path_resolution_ignores_non_file_urls() -> None:
    # In-memory and non-SQLite URLs must resolve to None, never raise.
    assert database_file_path("sqlite://") is None
    assert database_file_path("sqlite:///:memory:") is None
    assert database_file_path("postgresql://user:pass@host/db") is None
    assert database_file_path("sqlite:///./relative.sqlite") is not None
