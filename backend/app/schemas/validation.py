"""Phase 3B validation request/response schemas.

Findings expose only what a reviewer needs; no fingerprints of confidential
material beyond content hashes, no provider internals, no storage paths.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# --- submissions ---------------------------------------------------------------


class SubmissionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1)


class SubmissionVersionCreate(BaseModel):
    text: str = Field(min_length=1)


class ContentVersionOut(BaseModel):
    id: str
    version: int
    text_sha256: str
    char_count: int
    created_by: str
    created_at: str


class SubmissionOut(BaseModel):
    id: str
    title: str
    status: str  # draft | validated | partial | failed
    created_by: str
    created_at: str
    updated_at: str


class SubmissionDetailOut(SubmissionOut):
    versions: list[ContentVersionOut]


class SubmissionListResponse(BaseModel):
    submissions: list[SubmissionOut]


class ValidateRequest(BaseModel):
    content_version_id: str = Field(min_length=1, max_length=64)


# --- validation runs -------------------------------------------------------------


class FindingOut(BaseModel):
    id: str
    category: str
    severity: str  # low | medium | high
    source: str  # deterministic | ai
    rule_id: str | None = None
    rule_version: int | None = None
    snippet: str
    start_offset: int | None = None
    end_offset: int | None = None
    explanation: str
    suggested_text: str | None = None
    verification_status: str  # SUPPORTED | NEEDS_VERIFICATION | INVALID_SOURCE | NOT_APPLICABLE
    evidence_chunk_ids: list[str]
    needs_verification_reason: str | None = None


class EvidenceOut(BaseModel):
    id: str
    chunk_id: str
    document_id: str
    document_title: str
    doc_type: str
    document_version: int
    section_ref: str
    page_start: int | None = None
    page_end: int | None = None
    text: str


class ValidationRunOut(BaseModel):
    id: str
    submission_id: str
    content_version_id: str
    state: str  # pending | running | completed | partial | failed
    ai_status: str  # complete | partial | unavailable | skipped_budget | pending
    partial_reason: str | None = None
    error_code: str | None = None
    cache_hit: bool
    prompt_version: str
    model_id: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    provider_latency_ms: int | None = None
    created_at: str
    completed_at: str | None = None
    findings: list[FindingOut] = []
    evidence: list[EvidenceOut] = []


class ValidationRunSummaryOut(BaseModel):
    id: str
    submission_id: str
    content_version_id: str
    state: str
    ai_status: str
    cache_hit: bool
    finding_count: int
    created_at: str
    completed_at: str | None = None


class RunListResponse(BaseModel):
    runs: list[ValidationRunSummaryOut]
