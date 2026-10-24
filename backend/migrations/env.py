"""Alembic environment for BrandSentry.

The database URL comes from BrandSentry settings (environment / .env), not
from alembic.ini, so the same migrations run locally and on the Railway
volume. ``target_metadata`` is wired to the ORM Base for autogenerate support.
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the ``app`` package importable when alembic runs from backend/.
backend_dir = Path(__file__).resolve().parents[1]
for candidate in (backend_dir, backend_dir.parent):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from app.config import get_settings  # noqa: E402
from app.db import models  # noqa: F401,E402  (imported for metadata side effects)
from app.db.base import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    # Priority: programmatic override (app startup) -> -x database_url=...
    # -> BrandSentry settings (environment / .env).
    from_config = config.get_main_option("sqlalchemy.url")
    if from_config and not from_config.startswith("driver://"):
        return from_config
    override = context.get_x_argument(as_dictionary=True).get("database_url")
    if override:
        return override
    return get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # render_as_batch enables table-alterations on SQLite.
        context.configure(
            connection=connection, target_metadata=target_metadata, render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
