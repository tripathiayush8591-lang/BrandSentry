"""Declarative base for all ORM models.

Phase 1A ships no production tables on purpose: domain entities (workspaces,
submissions, findings, ...) arrive in later phases together with Alembic
migrations. Tests may attach their own models to this Base.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for every BrandSentry ORM model."""
