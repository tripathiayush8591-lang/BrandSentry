"""Phase 4B: atomic daily provider budget reservation counters.

Revision ID: 0005_provider_budget_reservation
Revises: 0004_validation
Create Date: 2026-10-24

Additive only: one new table holding per-UTC-day global provider budget
reservations (calls + tokens), written atomically BEFORE each provider
attempt so failed/timeout/retried attempts consume budget exactly like
successful ones. The ``provider_usage`` ledger remains the observability
record; it no longer backs enforcement.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_provider_budget_reservation"
down_revision = "0004_validation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "provider_budget_days",
        sa.Column("day", sa.String(length=10), primary_key=True),
        sa.Column("calls_reserved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_reserved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("provider_budget_days")
