"""Phase 3A hardening: per-chunk PDF page-span end.

Revision ID: 0003_chunk_page_span
Revises: 0002_knowledge
Create Date: 2026-10-24

Additive only: adds nullable ``knowledge_chunks.page_end`` so a chunk merged
from sections spanning several PDF pages reports its full page range instead
of only the page it starts on. Existing rows keep NULL (plain text) or can be
backfilled as ``page_end = page_number`` (single-page chunks); the API treats
a missing end as "same as page_number" for legacy rows.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_chunk_page_span"
down_revision = "0002_knowledge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("knowledge_chunks", sa.Column("page_end", sa.Integer(), nullable=True))
    # Legacy single-page chunks: the span end equals the start page.
    op.execute("UPDATE knowledge_chunks SET page_end = page_number WHERE page_number IS NOT NULL")


def downgrade() -> None:
    op.drop_column("knowledge_chunks", "page_end")
