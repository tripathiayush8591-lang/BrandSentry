"""Phase 5A: isolated human review projection and append-only decisions."""

import sqlalchemy as sa
from alembic import op

revision = "0006_human_review"
down_revision = "0005_provider_budget_reservation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_states",
        sa.Column(
            "run_id",
            sa.String(64),
            sa.ForeignKey("validation_runs.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("final_decision", sa.String(24), nullable=True),
        sa.CheckConstraint("revision >= 0", name="ck_review_revision"),
    )
    op.create_table(
        "review_decisions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(64),
            sa.ForeignKey("workspaces.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "run_id",
            sa.String(64),
            sa.ForeignKey("validation_runs.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "finding_id",
            sa.String(64),
            sa.ForeignKey("validation_findings.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "actor_id",
            sa.String(64),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("actor_name", sa.String(200), nullable=False),
        sa.Column("actor_role", sa.String(16), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("decision", sa.String(24), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("run_id", "revision", name="uq_review_run_revision"),
        sa.UniqueConstraint("workspace_id", "actor_id", "idempotency_key", name="uq_review_key"),
        sa.CheckConstraint("revision > 0", name="ck_decision_revision"),
        sa.CheckConstraint(
            "(finding_id IS NOT NULL AND decision IN ('accept', 'reject', 'flag')) OR "
            "(finding_id IS NULL AND decision IN ('approve', 'request_changes'))",
            name="ck_review_decision_target",
        ),
    )
    op.create_index("ix_review_decisions_run", "review_decisions", ["run_id", "revision"])
    # Decisions double as the audit ledger. Even accidental ORM updates or
    # cascading deletes cannot silently erase prior human actions.
    for operation in ("UPDATE", "DELETE"):
        op.execute(
            f"CREATE TRIGGER review_decisions_no_{operation.lower()} BEFORE {operation} "
            "ON review_decisions BEGIN SELECT RAISE(ABORT, 'review decisions are immutable'); END"
        )


def downgrade() -> None:
    for operation in ("update", "delete"):
        op.execute(f"DROP TRIGGER IF EXISTS review_decisions_no_{operation}")
    op.drop_table("review_decisions")
    op.drop_table("review_states")
