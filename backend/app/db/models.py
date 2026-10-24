"""Phase 2A identity models: users, workspaces, memberships, auth sessions.

Contract notes (docs/DATA_API_CONTRACTS.md, amended for Phase 2A):
- ``users.firebase_uid`` is the stable external identity for Google users and
  is NULL for guest demo actors (guests are never fake Firebase users).
- The proposed ``guest_sessions`` entity is implemented as a single
  ``auth_sessions`` table covering both Google-backed and guest sessions
  (kind column). Raw session tokens are never stored, only SHA-256 hashes.
- Roles live in ``memberships`` and are assigned exclusively server-side;
  no endpoint accepts a role from client input.

Phase 3A knowledge models (docs/DATA_API_CONTRACTS.md §9):
- ``knowledge_documents`` is the logical source (stable ID, type, status,
  active version pointer); ``knowledge_document_versions`` holds one
  immutable content snapshot per upload (checksum, stored file, extraction
  status). This realises the contract's ``knowledge_sources`` +
  ``source_versions`` split under the Phase 3A task naming.
- ``knowledge_chunks`` holds extracted, section-bounded text; an SQLite FTS5
  external-content table (``knowledge_chunks_fts``) mirrors the text column
  via triggers (migration 0002_knowledge) — never queried directly by
  workspace-unscoped code.
- ``brand_rules`` / ``approved_claims`` are explicitly created by authorised
  roles; nothing is auto-extracted into an authoritative rule.
- ``rate_limit_events`` is a generic DB-backed sliding-window counter for
  expensive operations (uploads, searches) — no external Redis.

Phase 3B validation models (docs/DATA_API_CONTRACTS.md §10):
- ``content_submissions`` + ``content_versions`` mirror the knowledge
  document/version split: the submission is the logical item across
  revisions, each version an immutable text snapshot (SHA-256 recorded).
- ``validation_runs`` capture one engine execution per content version with
  engine state, separate ``ai_status``, cache/idempotency fingerprint and
  actual provider usage. A model failure is never persisted as completed.
- ``validation_findings`` + ``validation_evidence`` keep findings and the
  exact evidence snapshot a run was allowed to cite (chunk id, document,
  version, section, page span, text) so runs stay auditable after the
  knowledge base changes.
- ``validation_cache`` (content-hash keyed, workspace-scoped, TTL) avoids
  repeat provider calls; a row with ``response_json`` NULL is an in-flight
  lease. ``idempotency_records`` make retried POSTs replay the same run.
- ``provider_usage`` logs every real provider attempt (no credentials, no
  user text) and backs the daily global call/token budget counters.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

UserRole = Literal["admin", "creator", "reviewer"]
SessionKind = Literal["google", "guest"]
WorkspaceKind = Literal["real", "demo"]
# Knowledge document types (Phase 3A): guidelines, approved factual claims,
# terminology, tone/messaging rules, claims policies, general source documents.
DocumentKind = Literal[
    "guidelines",
    "approved_claims",
    "terminology",
    "tone_messaging",
    "claims_policy",
    "source_document",
]
# Lifecycle: newly uploaded documents start pending and must be approved by an
# admin before retrieval surfaces them; deleted is a soft state.
DocumentStatus = Literal["pending", "approved", "rejected", "deleted"]
ExtractionStatus = Literal["pending", "extracted", "incomplete", "empty", "failed"]

# Phase 3B vocabularies.
SubmissionStatus = Literal["draft", "validated", "partial", "failed"]
RunState = Literal["pending", "running", "completed", "partial", "failed"]
# Engine component state, reported separately from the run state
# (docs/AI_VALIDATION.md §1): COMPLETE | PARTIAL | UNAVAILABLE | SKIPPED_BUDGET.
AiStatus = Literal["complete", "partial", "unavailable", "skipped_budget"]
FindingSeverity = Literal["low", "medium", "high"]
VerificationStatus = Literal["SUPPORTED", "NEEDS_VERIFICATION", "INVALID_SOURCE", "NOT_APPLICABLE"]
FindingSource = Literal["deterministic", "ai"]


def new_id(prefix: str) -> str:
    """Public identifier: short prefix + UUID4 hex (non-enumerable)."""
    return f"{prefix}_{uuid.uuid4().hex}"


def utc_now() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    firebase_uid: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    display_name: Mapped[str] = mapped_column(String(200))
    user_kind: Mapped[str] = mapped_column(String(16))  # "google" | "guest"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    memberships: Mapped[list[Membership]] = relationship(back_populates="user")


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))  # "real" | "demo"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    memberships: Mapped[list[Membership]] = relationship(back_populates="workspace")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_membership_workspace_user"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16))  # admin | creator | reviewer
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="memberships")
    workspace: Mapped[Workspace] = relationship(back_populates="memberships")


class AuthSession(Base):
    """Server-side opaque session. Raw tokens stay with the client only."""

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_ip_created", "ip", "created_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Workspace the session is scoped to; fixed at creation so a session can
    # never migrate onto another workspace (isolation + fixation defence).
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16))  # "google" | "guest"
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    csrf_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


# ---------------------------------------------------------------------------
# Phase 3A — Brand Knowledge Vault
# ---------------------------------------------------------------------------


class KnowledgeDocument(Base):
    """Logical knowledge source owned by exactly one workspace.

    Re-uploading content for the same document creates a new immutable
    version row and advances ``active_version``; prior versions stay for
    audit but their chunks are removed from the searchable index.
    """

    __tablename__ = "knowledge_documents"
    __table_args__ = (
        Index("ix_knowledge_documents_workspace_status", "workspace_id", "status", "created_at"),
        UniqueConstraint("workspace_id", "title", name="uq_knowledge_doc_workspace_title"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Version number of the currently active content snapshot.
    active_version: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    versions: Mapped[list[KnowledgeDocumentVersion]] = relationship(
        back_populates="document", order_by="KnowledgeDocumentVersion.version"
    )


class KnowledgeDocumentVersion(Base):
    """Immutable content snapshot produced by one successful ingestion."""

    __tablename__ = "knowledge_document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version", name="uq_knowledge_doc_version"),
        Index("ix_knowledge_doc_versions_document", "document_id", "version"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # text/plain | application/pdf
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    page_count: Mapped[int | None] = mapped_column(nullable=True)
    extraction_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_by: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="versions")


class KnowledgeChunk(Base):
    """Extracted, section-bounded text unit from one document version."""

    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_chunks_workspace_doc", "workspace_id", "document_id", "version"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False)
    section_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    # First (inclusive) page of the PDF page span this chunk was extracted
    # from; NULL for plain text. ``page_end`` completes the span when a chunk
    # merges sections from several pages.
    page_number: Mapped[int | None] = mapped_column(nullable=True)
    page_end: Mapped[int | None] = mapped_column(nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    char_offset: Mapped[int] = mapped_column(nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class BrandRule(Base):
    """Explicit deterministic rule authored by an authorised workspace role.

    Never auto-generated from uploaded text. ``version`` increments on each
    update so validation runs can record which rule revision they applied.
    """

    __tablename__ = "brand_rules"
    __table_args__ = (Index("ix_brand_rules_workspace_enabled", "workspace_id", "enabled"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    rule_text: Mapped[str] = mapped_column(Text, nullable=False)
    # How ``pattern`` is interpreted: "contains" | "exact" | "regex".
    matcher_type: Mapped[str] = mapped_column(String(16), nullable=False, default="contains")
    pattern: Mapped[str] = mapped_column(Text, nullable=False)
    replacement: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    version: Mapped[int] = mapped_column(nullable=False, default=1)
    # Optional provenance: the approved document this rule was derived from.
    source_document_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("knowledge_documents.id", ondelete="SET NULL"), nullable=True
    )
    source_section_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class ApprovedClaim(Base):
    """An approved factual claim the brand is allowed to state publicly."""

    __tablename__ = "approved_claims"
    __table_args__ = (Index("ix_approved_claims_workspace", "workspace_id", "status"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active"
    )  # active | retired
    source_document_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("knowledge_documents.id", ondelete="SET NULL"), nullable=True
    )
    source_section_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class RateLimitEvent(Base):
    """One counted occurrence of a rate-limited operation (sliding window)."""

    __tablename__ = "rate_limit_events"
    __table_args__ = (
        Index("ix_rate_limit_events_scope_key_created", "scope", "object_key", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    scope: Mapped[str] = mapped_column(String(40), nullable=False)  # e.g. "knowledge_upload"
    object_key: Mapped[str] = mapped_column(String(120), nullable=False)  # actor/session id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


# ---------------------------------------------------------------------------
# Phase 3B — Content submissions and the hybrid validation engine
# ---------------------------------------------------------------------------


class ContentSubmission(Base):
    """Logical content item across revisions; every record is workspace-owned."""

    __tablename__ = "content_submissions"
    __table_args__ = (
        Index("ix_content_submissions_workspace_status", "workspace_id", "status", "created_at"),
        UniqueConstraint("workspace_id", "title", name="uq_content_submission_workspace_title"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # draft -> validated|partial|failed; a new version resets to draft. The
    # review-side transitions (in_review/approved) arrive with human review.
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    versions: Mapped[list[ContentVersion]] = relationship(
        back_populates="submission", order_by="ContentVersion.version"
    )


class ContentVersion(Base):
    """Immutable submission text snapshot; never edited in place."""

    __tablename__ = "content_versions"
    __table_args__ = (
        UniqueConstraint("submission_id", "version", name="uq_content_version"),
        Index(
            "ix_content_versions_workspace_submission",
            "workspace_id",
            "submission_id",
            "version",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    submission_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("content_submissions.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    text_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    char_count: Mapped[int] = mapped_column(nullable=False)
    created_by: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    submission: Mapped[ContentSubmission] = relationship(back_populates="versions")


class ValidationRun(Base):
    """One execution of the hybrid engine against one exact content version.

    ``state`` is the run-level outcome; ``ai_status`` reports the AI engine
    component separately so a deterministic-only partial result can never be
    mistaken for a complete validation (docs/AI_VALIDATION.md §1).
    """

    __tablename__ = "validation_runs"
    __table_args__ = (
        Index("ix_validation_runs_workspace_created", "workspace_id", "created_at"),
        Index("ix_validation_runs_content_version", "workspace_id", "content_version_id"),
        Index("ix_validation_runs_fingerprint", "workspace_id", "fingerprint"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    submission_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("content_submissions.id", ondelete="CASCADE"), nullable=False
    )
    content_version_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=False
    )
    requested_by: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    ai_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    partial_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Cache/idempotency fingerprint: SHA-256 over (workspace, content hash,
    # evidence set, rule versions, prompt version, model, task type).
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    cache_hit: Mapped[bool] = mapped_column(nullable=False, default=False)
    # Fingerprint inputs, recorded for audit (why this run shared/missed cache).
    source_set_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    rules_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(40), nullable=False)
    model_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Actual provider usage when a real call happened (never fabricated).
    prompt_tokens: Mapped[int | None] = mapped_column(nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(nullable=True)
    provider_latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    findings: Mapped[list[ValidationFinding]] = relationship(
        back_populates="run", order_by="ValidationFinding.created_at"
    )
    evidence: Mapped[list[ValidationEvidence]] = relationship(back_populates="run")


class ValidationFinding(Base):
    """A single issue reported by the deterministic engine or by Gemini.

    ``verification_status`` is assigned server-side only: deterministic
    findings are SUPPORTED by construction; AI findings are SUPPORTED only
    when every citation resolves to the run's own verified evidence set.
    """

    __tablename__ = "validation_findings"
    __table_args__ = (Index("ix_validation_findings_run", "run_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("validation_runs.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    # deterministic | ai — how this finding was produced.
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    rule_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rule_version: Mapped[int | None] = mapped_column(nullable=True)
    snippet: Mapped[str] = mapped_column(Text, nullable=False)
    start_offset: Mapped[int | None] = mapped_column(nullable=True)
    end_offset: Mapped[int | None] = mapped_column(nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False)
    # Chunk IDs this finding cites; every ID is verified to exist in the
    # run's evidence snapshot before persistence (no fabricated citations).
    evidence_chunk_ids: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]"
    )  # JSON array of chunk ids
    needs_verification_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    run: Mapped[ValidationRun] = relationship(back_populates="findings")


class ValidationEvidence(Base):
    """The exact approved evidence snapshot one run was allowed to cite.

    Copied at run time (chunk id, document, version, section, page span,
    exact text) so the run stays explainable even if the knowledge base is
    later edited, superseded or deleted.
    """

    __tablename__ = "validation_evidence"
    __table_args__ = (
        UniqueConstraint("run_id", "chunk_id", name="uq_validation_evidence_run_chunk"),
        Index("ix_validation_evidence_run", "run_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("validation_runs.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    chunk_id: Mapped[str] = mapped_column(String(64), nullable=False)
    document_id: Mapped[str] = mapped_column(String(64), nullable=False)
    document_title: Mapped[str] = mapped_column(String(200), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(32), nullable=False)
    document_version: Mapped[int] = mapped_column(nullable=False)
    section_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    page_start: Mapped[int | None] = mapped_column(nullable=True)
    page_end: Mapped[int | None] = mapped_column(nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    run: Mapped[ValidationRun] = relationship(back_populates="evidence")


class ValidationCache(Base):
    """Workspace-scoped, content-hash keyed cache of verified AI results.

    ``response_json`` NULL marks an in-flight lease taken before a provider
    call (single-flight duplicate protection); stale leases are re-taken
    after the provider timeout window so crashes cannot deadlock a result.
    """

    __tablename__ = "validation_cache"
    __table_args__ = (Index("ix_validation_cache_workspace_expires", "workspace_id", "expires_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    key_digest: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    schema_version: Mapped[str] = mapped_column(String(40), nullable=False)
    model_id: Mapped[str] = mapped_column(String(80), nullable=False)
    # Set while the row is an in-flight lease so a concurrent duplicate can
    # be pointed at the exact run already executing this fingerprint.
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IdempotencyRecord(Base):
    """Client idempotency key -> the validation run it produced.

    A replayed key returns the same run; the same key with a different
    request payload is a 409 conflict.
    """

    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("workspace_id", "route", "key", name="uq_idempotency_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    route: Mapped[str] = mapped_column(String(120), nullable=False)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ProviderUsage(Base):
    """One real external provider attempt (success or failure).

    Observability ledger: no credentials, no user content, no prompts —
    outcome, timing and token counts only (docs/AI_VALIDATION.md §5
    observability). Outcomes distinguish attempted usage: ``ok`` rows carry
    the billable token counts; ``timeout``/``rate_limited``/``invalid_output``
    /``error`` rows are failed attempts that still consumed capacity.
    Budget *enforcement* uses the ``provider_budget_days`` reservation
    counters, not sums over this table.
    """

    __tablename__ = "provider_usage"
    __table_args__ = (Index("ix_provider_usage_workspace_created", "workspace_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_id: Mapped[str] = mapped_column(String(80), nullable=False)
    # ok | timeout | rate_limited | invalid_output | error
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    prompt_tokens: Mapped[int | None] = mapped_column(nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ProviderBudgetDay(Base):
    """Per-UTC-day global provider budget reservation counters.

    Enforced atomically BEFORE each provider attempt (docs/AI_VALIDATION.md
    §5 layer 8): a failed, timed-out or retried attempt consumes its
    reservation exactly like a successful one, so failures or retries can
    never be used to bypass the configured call/token limits. Token
    reservations are estimated before the call and reconciled with the
    provider-reported usage after a successful response.
    """

    __tablename__ = "provider_budget_days"

    # UTC date, ``YYYY-MM-DD`` — one row per day, created on first reserve.
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    calls_reserved: Mapped[int] = mapped_column(nullable=False, default=0)
    tokens_reserved: Mapped[int] = mapped_column(nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ReviewState(Base):
    """Human review projection, separate from immutable engine output."""

    __tablename__ = "review_states"
    __table_args__ = (CheckConstraint("revision >= 0", name="ck_review_revision"),)

    run_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("validation_runs.id", ondelete="RESTRICT"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(nullable=False, default=0)
    final_decision: Mapped[str | None] = mapped_column(String(24), nullable=True)


class ReviewDecision(Base):
    """Append-only decision and audit event; never edits findings or evidence."""

    __tablename__ = "review_decisions"
    __table_args__ = (
        UniqueConstraint("run_id", "revision", name="uq_review_run_revision"),
        UniqueConstraint("workspace_id", "actor_id", "idempotency_key", name="uq_review_key"),
        CheckConstraint("revision > 0", name="ck_decision_revision"),
        CheckConstraint(
            "(finding_id IS NOT NULL AND decision IN ('accept', 'reject', 'flag')) OR "
            "(finding_id IS NULL AND decision IN ('approve', 'request_changes'))",
            name="ck_review_decision_target",
        ),
        Index("ix_review_decisions_run", "run_id", "revision"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    run_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("validation_runs.id", ondelete="RESTRICT"), nullable=False
    )
    finding_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("validation_findings.id", ondelete="RESTRICT"), nullable=True
    )
    actor_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    actor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(16), nullable=False)
    is_demo: Mapped[bool] = mapped_column(nullable=False)
    revision: Mapped[int] = mapped_column(nullable=False)
    decision: Mapped[str] = mapped_column(String(24), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
