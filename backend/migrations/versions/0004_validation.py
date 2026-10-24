"""Phase 3B: submissions, validation runs, findings, evidence, cache, budgets.

Revision ID: 0004_validation
Revises: 0003_chunk_page_span
Create Date: 2026-10-24

Additive only: six new tables for the hybrid validation engine (content
submissions + immutable content versions, validation runs + findings +
evidence snapshots) and the API cost-control stack (result cache,
idempotency records, provider usage ledger). No existing table or column is
modified, so prior phases keep working unchanged.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_validation"
down_revision = "0003_chunk_page_span"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_submissions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("workspace_id", "title", name="uq_content_submission_workspace_title"),
    )
    op.create_index(
        "ix_content_submissions_workspace_status",
        "content_submissions",
        ["workspace_id", "status", "created_at"],
    )

    op.create_table(
        "content_versions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("submission_id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("text_sha256", sa.String(length=64), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["submission_id"], ["content_submissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("submission_id", "version", name="uq_content_version"),
    )
    op.create_index(
        "ix_content_versions_workspace_submission",
        "content_versions",
        ["workspace_id", "submission_id", "version"],
    )

    op.create_table(
        "validation_runs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("submission_id", sa.String(length=64), nullable=False),
        sa.Column("content_version_id", sa.String(length=64), nullable=False),
        sa.Column("requested_by", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("ai_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("partial_reason", sa.String(length=200), nullable=True),
        sa.Column("error_code", sa.String(length=60), nullable=True),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source_set_hash", sa.String(length=64), nullable=False),
        sa.Column("rules_hash", sa.String(length=64), nullable=False),
        sa.Column("prompt_version", sa.String(length=40), nullable=False),
        sa.Column("model_id", sa.String(length=80), nullable=True),
        sa.Column("idempotency_key", sa.String(length=120), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("provider_latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submission_id"], ["content_submissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["content_version_id"], ["content_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_validation_runs_workspace_created", "validation_runs", ["workspace_id", "created_at"]
    )
    op.create_index(
        "ix_validation_runs_content_version",
        "validation_runs",
        ["workspace_id", "content_version_id"],
    )
    op.create_index(
        "ix_validation_runs_fingerprint", "validation_runs", ["workspace_id", "fingerprint"]
    )

    op.create_table(
        "validation_findings",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("rule_id", sa.String(length=64), nullable=True),
        sa.Column("rule_version", sa.Integer(), nullable=True),
        sa.Column("snippet", sa.Text(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=True),
        sa.Column("end_offset", sa.Integer(), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("suggested_text", sa.Text(), nullable=True),
        sa.Column("verification_status", sa.String(length=24), nullable=False),
        sa.Column("evidence_chunk_ids", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("needs_verification_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["validation_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_validation_findings_run", "validation_findings", ["run_id", "created_at"])

    op.create_table(
        "validation_evidence",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("chunk_id", sa.String(length=64), nullable=False),
        sa.Column("document_id", sa.String(length=64), nullable=False),
        sa.Column("document_title", sa.String(length=200), nullable=False),
        sa.Column("doc_type", sa.String(length=32), nullable=False),
        sa.Column("document_version", sa.Integer(), nullable=False),
        sa.Column("section_ref", sa.String(length=100), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=True),
        sa.Column("page_end", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["validation_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("run_id", "chunk_id", name="uq_validation_evidence_run_chunk"),
    )
    op.create_index("ix_validation_evidence_run", "validation_evidence", ["run_id"])

    op.create_table(
        "validation_cache",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("key_digest", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=True),
        sa.Column("schema_version", sa.String(length=40), nullable=False),
        sa.Column("model_id", sa.String(length=80), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        # Inline (not ALTER): SQLite cannot add constraints post-create. The
        # unique cache key is the single-flight lease: one in-flight row per
        # fingerprint across duplicate concurrent requests.
        sa.UniqueConstraint("key_digest", name="uq_validation_cache_key"),
    )
    op.create_index(
        "ix_validation_cache_workspace_expires", "validation_cache", ["workspace_id", "expires_at"]
    )

    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("route", sa.String(length=120), nullable=False),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("workspace_id", "route", "key", name="uq_idempotency_key"),
    )

    op.create_table(
        "provider_usage",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("workspace_id", sa.String(length=64), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("model_id", sa.String(length=80), nullable=False),
        sa.Column("outcome", sa.String(length=20), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_provider_usage_workspace_created", "provider_usage", ["workspace_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("provider_usage")
    op.drop_table("idempotency_records")
    op.drop_table("validation_cache")
    op.drop_table("validation_evidence")
    op.drop_table("validation_findings")
    op.drop_table("validation_runs")
    op.drop_table("content_versions")
    op.drop_table("content_submissions")
