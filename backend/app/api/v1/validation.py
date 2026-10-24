"""Phase 3B content submission + hybrid validation endpoints.

All endpoints require a live session pinned to exactly one workspace; every
query is filtered by that workspace server-side (404, never 403, for other
workspaces' resources — no existence leak). Mutations require the session
CSRF header. Validation is synchronous: the response is the finished run
(``state`` completed/partial) or a replayed earlier run, so retries and
duplicate requests can never silently duplicate provider spend.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import func, select

from app.api.deps import Author, CsrfVerified, CurrentActor, DbSession
from app.config import Settings
from app.db.models import (
    ContentSubmission,
    ContentVersion,
    ValidationEvidence,
    ValidationFinding,
    ValidationRun,
)
from app.schemas.validation import (
    ContentVersionOut,
    EvidenceOut,
    FindingOut,
    RunListResponse,
    SubmissionCreate,
    SubmissionDetailOut,
    SubmissionListResponse,
    SubmissionOut,
    SubmissionVersionCreate,
    ValidateRequest,
    ValidationRunOut,
    ValidationRunSummaryOut,
)
from app.services import validation as validation_service
from app.services.gemini import GeminiProvider
from app.services.retrieval import FtsRetrievalService

router = APIRouter(tags=["validation"])

retrieval_service = FtsRetrievalService()


def _app_settings(request: Request) -> Settings:
    """The lifespan-configured Settings instance (respects per-test overrides)."""
    return request.app.state.settings


def _app_provider(request: Request) -> GeminiProvider:
    """The lifespan-installed Gemini adapter (tests replace this boundary)."""
    provider = getattr(request.app.state, "gemini_provider", None)
    if provider is None:  # defensive: the lifespan always installs one
        provider = GeminiProvider(request.app.state.settings)
        request.app.state.gemini_provider = provider
    return provider


AppSettings = Annotated[Settings, Depends(_app_settings)]
AppProvider = Annotated[GeminiProvider, Depends(_app_provider)]


def _require_workspace_submission(
    db: DbSession, workspace_id: str, submission_id: str
) -> ContentSubmission:
    submission = db.get(ContentSubmission, submission_id)
    if submission is None or submission.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


def _require_workspace_version(
    db: DbSession, workspace_id: str, submission: ContentSubmission, version_id: str
) -> ContentVersion:
    version = db.get(ContentVersion, version_id)
    if (
        version is None
        or version.workspace_id != workspace_id
        or version.submission_id != submission.id
    ):
        raise HTTPException(status_code=404, detail="Content version not found")
    return version


def _require_workspace_run(db: DbSession, workspace_id: str, run_id: str) -> ValidationRun:
    run = db.get(ValidationRun, run_id)
    if run is None or run.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Validation run not found")
    return run


def _version_out(version: ContentVersion) -> ContentVersionOut:
    return ContentVersionOut(
        id=version.id,
        version=version.version,
        text_sha256=version.text_sha256,
        char_count=version.char_count,
        created_by=version.created_by,
        created_at=version.created_at.isoformat(),
    )


def _submission_out(submission: ContentSubmission) -> SubmissionOut:
    return SubmissionOut(
        id=submission.id,
        title=submission.title,
        status=submission.status,
        created_by=submission.created_by,
        created_at=submission.created_at.isoformat(),
        updated_at=submission.updated_at.isoformat(),
    )


def _finding_out(finding: ValidationFinding) -> FindingOut:
    return FindingOut(
        id=finding.id,
        category=finding.category,
        severity=finding.severity,
        source=finding.source,
        rule_id=finding.rule_id,
        rule_version=finding.rule_version,
        snippet=finding.snippet,
        start_offset=finding.start_offset,
        end_offset=finding.end_offset,
        explanation=finding.explanation,
        suggested_text=finding.suggested_text,
        verification_status=finding.verification_status,
        evidence_chunk_ids=json.loads(finding.evidence_chunk_ids or "[]"),
        needs_verification_reason=finding.needs_verification_reason,
    )


def _evidence_out(evidence: ValidationEvidence) -> EvidenceOut:
    return EvidenceOut(
        id=evidence.id,
        chunk_id=evidence.chunk_id,
        document_id=evidence.document_id,
        document_title=evidence.document_title,
        doc_type=evidence.doc_type,
        document_version=evidence.document_version,
        section_ref=evidence.section_ref,
        page_start=evidence.page_start,
        page_end=evidence.page_end,
        text=evidence.text,
    )


def _run_out(run: ValidationRun) -> ValidationRunOut:
    return ValidationRunOut(
        id=run.id,
        submission_id=run.submission_id,
        content_version_id=run.content_version_id,
        state=run.state,
        ai_status=run.ai_status,
        partial_reason=run.partial_reason,
        error_code=run.error_code,
        cache_hit=run.cache_hit,
        prompt_version=run.prompt_version,
        model_id=run.model_id,
        prompt_tokens=run.prompt_tokens,
        completion_tokens=run.completion_tokens,
        total_tokens=run.total_tokens,
        provider_latency_ms=run.provider_latency_ms,
        created_at=run.created_at.isoformat(),
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        findings=[_finding_out(f) for f in run.findings],
        evidence=[_evidence_out(e) for e in run.evidence],
    )


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


@router.post("/submissions", status_code=201, response_model=SubmissionDetailOut)
def create_submission(
    body: SubmissionCreate, db: DbSession, actor: Author, _csrf: CsrfVerified, settings: AppSettings
) -> SubmissionDetailOut:
    """Create a submission with its first immutable content version."""
    try:
        submission, _ = validation_service.create_submission(
            db,
            settings,
            workspace_id=actor.workspace.id,
            created_by=actor.user.id,
            title=body.title,
            text=body.text,
        )
    except validation_service.ValidationError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message, headers=exc.headers
        ) from exc
    return SubmissionDetailOut(
        **_submission_out(submission).model_dump(),
        versions=[_version_out(v) for v in submission.versions],
    )


@router.get("/submissions", response_model=SubmissionListResponse)
def list_submissions(
    db: DbSession,
    actor: CurrentActor,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> SubmissionListResponse:
    submissions = db.scalars(
        select(ContentSubmission)
        .where(ContentSubmission.workspace_id == actor.workspace.id)
        .order_by(ContentSubmission.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return SubmissionListResponse(submissions=[_submission_out(s) for s in submissions])


@router.get("/submissions/{submission_id}", response_model=SubmissionDetailOut)
def get_submission(submission_id: str, db: DbSession, actor: CurrentActor) -> SubmissionDetailOut:
    submission = _require_workspace_submission(db, actor.workspace.id, submission_id)
    return SubmissionDetailOut(
        **_submission_out(submission).model_dump(),
        versions=[_version_out(v) for v in submission.versions],
    )


@router.post(
    "/submissions/{submission_id}/versions", status_code=201, response_model=ContentVersionOut
)
def create_version(
    submission_id: str,
    body: SubmissionVersionCreate,
    db: DbSession,
    actor: Author,
    _csrf: CsrfVerified,
    settings: AppSettings,
) -> ContentVersionOut:
    """Create the next immutable revision; the submission returns to draft."""
    submission = _require_workspace_submission(db, actor.workspace.id, submission_id)
    try:
        version = validation_service.add_version(
            db,
            settings,
            submission=submission,
            created_by=actor.user.id,
            text=body.text,
        )
    except validation_service.ValidationError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message, headers=exc.headers
        ) from exc
    return _version_out(version)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@router.post("/submissions/{submission_id}/validate", response_model=ValidationRunOut)
def validate_submission(
    submission_id: str,
    body: ValidateRequest,
    db: DbSession,
    actor: Author,
    _csrf: CsrfVerified,
    settings: AppSettings,
    provider: AppProvider,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> ValidationRunOut:
    """Run the hybrid engine against one exact content version (synchronous).

    ``Idempotency-Key`` (optional header): replaying the same key with the
    same payload returns the original run; the same key with a different
    payload is a 409 conflict.
    """
    submission = _require_workspace_submission(db, actor.workspace.id, submission_id)
    version = _require_workspace_version(
        db, actor.workspace.id, submission, body.content_version_id
    )
    try:
        validated = validation_service.validate_content(
            db,
            settings,
            provider,
            retrieval_service,
            actor=actor,
            submission=submission,
            version=version,
            idempotency_key=idempotency_key,
        )
    except validation_service.ValidationError as exc:
        raise HTTPException(
            status_code=exc.status_code, detail=exc.message, headers=exc.headers
        ) from exc
    return _run_out(validated.run)


@router.get("/validation-runs", response_model=RunListResponse)
def list_runs(
    db: DbSession,
    actor: CurrentActor,
    limit: int = Query(default=20, ge=1, le=50),
) -> RunListResponse:
    """The workspace's most recent validation runs (summaries only)."""
    runs = db.scalars(
        select(ValidationRun)
        .where(ValidationRun.workspace_id == actor.workspace.id)
        .order_by(ValidationRun.created_at.desc())
        .limit(limit)
    ).all()
    counts = {
        row[0]: row[1]
        for row in db.execute(
            select(ValidationFinding.run_id, func.count())
            .where(ValidationFinding.workspace_id == actor.workspace.id)
            .group_by(ValidationFinding.run_id)
        ).all()
    }
    return RunListResponse(
        runs=[
            ValidationRunSummaryOut(
                id=run.id,
                submission_id=run.submission_id,
                content_version_id=run.content_version_id,
                state=run.state,
                ai_status=run.ai_status,
                cache_hit=run.cache_hit,
                finding_count=counts.get(run.id, 0),
                created_at=run.created_at.isoformat(),
                completed_at=run.completed_at.isoformat() if run.completed_at else None,
            )
            for run in runs
        ]
    )


@router.get("/validation-runs/{run_id}", response_model=ValidationRunOut)
def get_run(run_id: str, db: DbSession, actor: CurrentActor) -> ValidationRunOut:
    """One run with its structured findings and the evidence snapshot."""
    run = _require_workspace_run(db, actor.workspace.id, run_id)
    return _run_out(run)
