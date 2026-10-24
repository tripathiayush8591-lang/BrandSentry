"""Phase 3A Brand Knowledge Vault: documents, versions, chunks, rules, claims.

Revision ID: 0002_knowledge
Revises: 0001_identity
Create Date: 2026-10-24

Additive only: Phase 2 identity tables are untouched. Creates the FTS5
external-content index (``knowledge_chunks_fts``) mirroring
``knowledge_chunks.text`` via AFTER INSERT/UPDATE/DELETE triggers, plus a
generic ``rate_limit_events`` sliding-window counter table.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_knowledge"
down_revision = "0001_identity"
branch_labels = None
depends_on = None

_FTS_TABLE = "knowledge_chunks_fts"


def _create_fts_triggers() -> None:
    op.execute(
        f"""
        CREATE TRIGGER knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
            INSERT INTO {_FTS_TABLE}(rowid, text) VALUES (new.rowid, new.text);
        END
        """
    )
    op.execute(
        f"""
        CREATE TRIGGER knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
            INSERT INTO {_FTS_TABLE}(knowledge_chunks_fts, rowid, text)
            VALUES ('delete', old.rowid, old.text);
        END
        """
    )
    op.execute(
        f"""
        CREATE TRIGGER knowledge_chunks_au AFTER UPDATE ON knowledge_chunks BEGIN
            INSERT INTO {_FTS_TABLE}(knowledge_chunks_fts, rowid, text)
            VALUES ('delete', old.rowid, old.text);
            INSERT INTO {_FTS_TABLE}(rowid, text) VALUES (new.rowid, new.text);
        END
        """
    )


def _drop_fts_triggers() -> None:
    for name in ("knowledge_chunks_ai", "knowledge_chunks_ad", "knowledge_chunks_au"):
        op.execute(f"DROP TRIGGER IF EXISTS {name}")


def upgrade() -> None:
    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("doc_type", sa.String(length=32), nullable=False),
        sa.Column("active_version", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("workspace_id", "title", name="uq_knowledge_doc_workspace_title"),
    )
    op.create_index(
        "ix_knowledge_documents_workspace_status",
        "knowledge_documents",
        ["workspace_id", "status", "created_at"],
    )

    op.create_table(
        "knowledge_document_versions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("document_id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column(
            "extraction_status", sa.String(length=16), nullable=False, server_default="pending"
        ),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("document_id", "version", name="uq_knowledge_doc_version"),
    )
    op.create_index(
        "ix_knowledge_doc_versions_document",
        "knowledge_document_versions",
        ["document_id", "version"],
    )

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("document_id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("section_ref", sa.String(length=100), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("char_offset", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_knowledge_chunks_workspace_doc",
        "knowledge_chunks",
        ["workspace_id", "document_id", "version"],
    )

    # External-content FTS5 index over knowledge_chunks.text, kept consistent
    # by triggers so chunk lifecycle (insert/delete on re-ingest) automatically
    # updates the search index.
    op.execute(
        f"CREATE VIRTUAL TABLE {_FTS_TABLE} USING fts5("
        "text, content='knowledge_chunks', content_rowid='rowid')"
    )
    _create_fts_triggers()

    op.create_table(
        "brand_rules",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("rule_text", sa.Text(), nullable=False),
        sa.Column("matcher_type", sa.String(length=16), nullable=False, server_default="contains"),
        sa.Column("pattern", sa.Text(), nullable=False),
        sa.Column("replacement", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source_document_id", sa.String(length=64), nullable=True),
        sa.Column("source_section_ref", sa.String(length=100), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_document_id"], ["knowledge_documents.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_brand_rules_workspace_enabled", "brand_rules", ["workspace_id", "enabled"])

    op.create_table(
        "approved_claims",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("claim_text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("source_document_id", sa.String(length=64), nullable=True),
        sa.Column("source_section_ref", sa.String(length=100), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_document_id"], ["knowledge_documents.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_approved_claims_workspace", "approved_claims", ["workspace_id", "status"])

    op.create_table(
        "rate_limit_events",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("scope", sa.String(length=40), nullable=False),
        sa.Column("object_key", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_rate_limit_events_scope_key_created",
        "rate_limit_events",
        ["scope", "object_key", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_rate_limit_events_scope_key_created", table_name="rate_limit_events")
    op.drop_table("rate_limit_events")
    op.drop_index("ix_approved_claims_workspace", table_name="approved_claims")
    op.drop_table("approved_claims")
    op.drop_index("ix_brand_rules_workspace_enabled", table_name="brand_rules")
    op.drop_table("brand_rules")
    _drop_fts_triggers()
    op.execute(f"DROP TABLE IF EXISTS {_FTS_TABLE}")
    op.drop_index("ix_knowledge_chunks_workspace_doc", table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")
    op.drop_index("ix_knowledge_doc_versions_document", table_name="knowledge_document_versions")
    op.drop_table("knowledge_document_versions")
    op.drop_index("ix_knowledge_documents_workspace_status", table_name="knowledge_documents")
    op.drop_table("knowledge_documents")
