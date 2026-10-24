"""Hybrid validation orchestrator (Phase 3B).

Pipeline per docs/AI_VALIDATION.md §2: preflight (input, quotas,
idempotency) -> deterministic rules -> workspace-scoped retrieval of
approved evidence -> AI stage behind cache/single-flight/budget controls ->
server-side citation verification -> merged, persisted findings.

Honesty contract:
- A model failure never yields a ``completed`` run: the run is ``partial``
  with a distinct ``ai_status`` (unavailable | skipped_budget | partial) and
  the deterministic findings are returned intact.
- Deterministic validation works with Gemini unavailable/absent.
- AI suggestions never modify the submitted content; findings are advisory.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    BrandRule,
    ContentSubmission,
    ContentVersion,
    IdempotencyRecord,
    ProviderBudgetDay,
    ProviderUsage,
    ValidationCache,
    ValidationEvidence,
    ValidationFinding,
    ValidationRun,
    new_id,
)
from app.services import ratelimit
from app.services.gemini import (
    AI_CATEGORIES,
    AIAnalysis,
    GeminiProvider,
    InvalidModelOutput,
    ProviderBudgetExhausted,
    ProviderConfigError,
    ProviderError,
    ProviderRateLimited,
    ProviderTimeout,
)
from app.services.identity import ActorWorkspace, as_utc
from app.services.retrieval import FtsRetrievalService, RetrievedChunk
from app.services.rules_engine import DeterministicFinding, run_deterministic_rules

logger = logging.getLogger(__name__)

ROUTE_VALIDATE = "POST /api/v1/submissions/validate"
CACHE_SCHEMA_VERSION = "validation-cache-1"

# A lease/running run older than this is stale (provider timed out or the
# process crashed mid-run); it may be re-taken.
LEASE_GRACE_SECONDS = 10


class ValidationError(Exception):
    """Client-facing validation error mapped to a status code by the API."""

    def __init__(
        self, status_code: int, message: str, headers: dict[str, str] | None = None
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.headers = headers or {}
        super().__init__(message)


class InFlightRun(Exception):
    """An identical validation is already executing; carry its run id."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__("identical validation run in progress")


@dataclass(frozen=True)
class ValidatedRun:
    run: ValidationRun
    idempotency_replay: bool


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


def _clean_text(text: str) -> str:
    return text


def create_submission(
    db: Session,
    settings: Settings,
    *,
    workspace_id: str,
    created_by: str,
    title: str,
    text: str,
) -> tuple[ContentSubmission, ContentVersion]:
    text = _clean_text(text)
    if not text.strip():
        raise ValidationError(422, "Submission text must not be empty")
    if len(text) > settings.validation_max_content_chars:
        raise ValidationError(
            413,
            f"Submission text exceeds the maximum of "
            f"{settings.validation_max_content_chars} characters.",
        )
    submission = ContentSubmission(
        id=new_id("sub"), workspace_id=workspace_id, created_by=created_by, title=title
    )
    db.add(submission)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError(
            409, "A submission with this title already exists in this workspace"
        ) from exc
    version = _new_version(db, settings, submission=submission, created_by=created_by, text=text)
    try:
        db.commit()
    except IntegrityError as exc:
        # Unique (workspace_id, title) violated in the same transaction —
        # e.g. a concurrent duplicate creation: a stable 409, never a 500.
        db.rollback()
        raise ValidationError(
            409, "A submission with this title already exists in this workspace"
        ) from exc
    db.refresh(submission)
    return submission, version


def add_version(
    db: Session,
    settings: Settings,
    *,
    submission: ContentSubmission,
    created_by: str,
    text: str,
) -> ContentVersion:
    """Create the next immutable revision; the submission returns to draft.

    Allowed from any non-deleted state: editing a validated item starts a new
    unapproved revision and never alters the validated one.
    """
    text = _clean_text(text)
    if not text.strip():
        raise ValidationError(422, "Submission text must not be empty")
    if len(text) > settings.validation_max_content_chars:
        raise ValidationError(
            413,
            f"Submission text exceeds the maximum of "
            f"{settings.validation_max_content_chars} characters.",
        )
    version = _new_version(db, settings, submission=submission, created_by=created_by, text=text)
    submission.status = "draft"
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError(409, "Submission not found or concurrently modified") from exc
    db.refresh(submission)
    return version


def _new_version(
    db: Session,
    settings: Settings,
    *,
    submission: ContentSubmission,
    created_by: str,
    text: str,
) -> ContentVersion:
    next_number = (
        db.scalar(
            select(func.max(ContentVersion.version)).where(
                ContentVersion.submission_id == submission.id
            )
        )
        or 0
    ) + 1
    version = ContentVersion(
        id=new_id("cv"),
        submission_id=submission.id,
        workspace_id=submission.workspace_id,
        version=next_number,
        text=text,
        text_sha256=sha256_hex(text),
        char_count=len(text),
        created_by=created_by,
    )
    db.add(version)
    db.flush()
    return version


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _rules_hash(rules: list[BrandRule]) -> str:
    return sha256_hex(json.dumps(sorted((rule.id, rule.version, rule.enabled) for rule in rules)))


def _source_set_hash(chunks: list[RetrievedChunk]) -> str:
    return sha256_hex(json.dumps(sorted((c.chunk_id, c.document_id, c.version) for c in chunks)))


def _fingerprint(
    *,
    workspace_id: str,
    content_sha256: str,
    source_set_hash: str,
    rules_hash: str,
    prompt_version: str,
    model_id: str,
) -> str:
    parts = [
        CACHE_SCHEMA_VERSION,
        workspace_id,
        content_sha256,
        source_set_hash,
        rules_hash,
        prompt_version,
        model_id,
        "analyze",
    ]
    return sha256_hex(json.dumps(parts))


def _budget_day() -> str:
    """The UTC date key under which reservations are counted."""
    return datetime.now(UTC).date().isoformat()


def _estimate_attempt_tokens(
    content: str, chunks: list[RetrievedChunk], rules: list[BrandRule]
) -> int:
    """Conservative pre-call token estimate for one provider attempt.

    The real prompt is assembled inside the adapter; before the call only a
    char-based estimate is possible (~4 chars/token plus fixed scaffolding
    for instructions, schema and rule text). Successful responses reconcile
    this estimate with the provider-reported usage.
    """
    chars = (
        len(content)
        + sum(len(chunk.text) for chunk in chunks)
        + sum(len(rule.rule_text) for rule in rules)
    )
    return chars // 4 + 256


def _budget_exhausted(db: Session, settings: Settings) -> bool:
    """Read-only peek used only for honest ``skipped_budget`` reporting.

    Actual enforcement is the atomic reservation taken by the per-attempt
    guard before every real provider request.
    """
    row = db.get(ProviderBudgetDay, _budget_day(), populate_existing=True)
    if row is None:
        return False
    return (
        row.calls_reserved >= settings.gemini_calls_per_day
        or row.tokens_reserved >= settings.gemini_tokens_per_day
    )


def _reserve_provider_budget(
    db: Session,
    *,
    calls: int,
    tokens: int,
    calls_limit: int,
    tokens_limit: int,
) -> str | None:
    """Atomically reserve provider capacity for one attempt.

    Returns the UTC day the reservation was charged to, or None when the
    reservation would exceed the configured limits. The conditional UPDATE
    is atomic under SQLite's single-writer lock, so concurrent distinct
    requests cannot collectively overshoot the budget, and every attempt —
    successful or failed — consumes its reservation before any network I/O.
    """
    day = _budget_day()
    for _ in range(2):  # one retry covers the first-of-day insert race
        # populate_existing: consecutive reservations in one request must
        # see the committed counter, not an identity-map cached instance.
        row = db.get(ProviderBudgetDay, day, populate_existing=True)
        if row is None:
            if calls > calls_limit or tokens > tokens_limit:
                return None
            db.add(ProviderBudgetDay(day=day, calls_reserved=calls, tokens_reserved=tokens))
            try:
                db.commit()
                return day
            except IntegrityError:
                # Another worker created today's row first: fall through to
                # the conditional-update path.
                db.rollback()
                continue
        result = db.execute(
            update(ProviderBudgetDay)
            .where(
                ProviderBudgetDay.day == day,
                ProviderBudgetDay.calls_reserved + calls <= calls_limit,
                ProviderBudgetDay.tokens_reserved + tokens <= tokens_limit,
            )
            .values(
                calls_reserved=ProviderBudgetDay.calls_reserved + calls,
                tokens_reserved=ProviderBudgetDay.tokens_reserved + tokens,
                updated_at=datetime.now(UTC),
            )
        )
        db.commit()
        return day if result.rowcount > 0 else None
    return None


def _reconcile_token_reservation(
    db: Session, *, day: str, estimated: int, actual: int | None
) -> None:
    """Adjust the day's token reservation to the provider-reported usage.

    Unknown usage keeps the conservative estimate; a successful response
    refunds the over-estimate or records the honest overshoot (a request
    that already happened is never hidden from the ledger).
    """
    if actual is None:
        return
    row = db.get(ProviderBudgetDay, day, populate_existing=True)
    if row is None:
        return
    row.tokens_reserved = max(0, row.tokens_reserved + (max(0, actual) - estimated))
    row.updated_at = datetime.now(UTC)
    db.commit()


def _check_quotas(db: Session, settings: Settings, actor: ActorWorkspace) -> None:
    """Per-user, per-workspace rolling-hour quotas (DB-backed, restart-safe)."""
    user_limit = (
        settings.validation_guest_per_hour
        if actor.user.user_kind == "guest"
        else settings.validation_user_per_hour
    )
    checks: list[tuple[str, str, int]] = [
        ("validation_user", actor.user.id, user_limit),
        ("validation_workspace", actor.workspace.id, settings.validation_workspace_per_hour),
    ]
    for scope, key, limit in checks:
        try:
            ratelimit.check_rate_limit(db, scope=scope, key=key, limit=limit)
        except ratelimit.RateLimitExceeded as exc:
            raise ValidationError(
                429,
                "Validation rate limit reached. Please retry later.",
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from exc


def _evidence_payload(chunks: list[RetrievedChunk]) -> list[dict[str, Any]]:
    return [
        {
            "source_id": chunk.chunk_id,
            "title": chunk.document_title,
            "version": chunk.version,
            "section_ref": chunk.section_ref,
            "page_start": chunk.page_number,
            "page_end": chunk.page_end,
            "text": chunk.text,
        }
        for chunk in chunks
    ]


def _normalize_for_match(value: str) -> str:
    """Case- and whitespace-insensitive comparison form for quote checks."""
    return " ".join(value.strip().lower().split())


def _verify_ai_findings(
    analysis: AIAnalysis,
    evidence_by_chunk_id: dict[str, RetrievedChunk],
    content: str,
) -> list[dict[str, Any]]:
    """Verify AI citations and classify support conservatively.

    What is checked mechanically:
    - **Source authenticity** (existing checks preserved): a claimed chunk ID
      must resolve to this run's own evidence snapshot, and the finding's
      quote must actually occur in the cited chunk text. Failures drop the
      citation — fabricated IDs never appear as evidence.
    - **Content anchoring**: the finding's quote must occur in the submitted
      content, so a finding cannot cite real evidence for text that was
      never submitted.

    What is deliberately NOT claimed: whether an authentic source actually
    *supports* the finding's conclusion is a semantic judgement this MVP
    cannot verify. Phrase overlap between a quote and a source proves
    nothing about support (an unrelated conclusion quoting a brand name is
    not "supported"), so AI findings are never elevated to ``SUPPORTED`` by
    citation checks alone — they remain ``NEEDS_VERIFICATION`` for human
    review (docs/AI_VALIDATION.md §1/§4). Deterministic findings keep
    ``SUPPORTED`` because they are exact matches against real rule rows.
    """
    normalized_content = _normalize_for_match(content)
    verified: list[dict[str, Any]] = []
    for finding in analysis.findings:
        category = finding.category if finding.category in AI_CATEGORIES else "policy_concern"
        quote = _normalize_for_match(finding.quote_or_range)
        anchored = bool(quote) and quote in normalized_content
        valid_ids: list[str] = []
        if anchored:
            for claimed in finding.claimed_source_ids[:6]:
                chunk = evidence_by_chunk_id.get(claimed)
                if chunk is None:
                    logger.info("Dropped fabricated AI citation (unknown chunk id)")
                    continue
                if quote not in _normalize_for_match(chunk.text):
                    logger.info("Dropped AI citation: quote not present in cited chunk")
                    continue
                valid_ids.append(claimed)
        if not anchored:
            reason = (
                "The finding's quote does not appear in the submitted content, "
                "so its citation is not shown as evidence; human review required."
            )
        elif not valid_ids:
            reason = finding.needs_verification_reason or (
                "No approved evidence supplied supports this issue."
            )
        else:
            reason = finding.needs_verification_reason or (
                "The cited source is authentic and the quote appears in the submitted "
                "content, but whether the source actually supports this conclusion was "
                "not machine-verified; human review required."
            )
        verified.append(
            {
                "category": category,
                "severity": finding.severity,
                "source": "ai",
                "snippet": finding.quote_or_range,
                "explanation": finding.explanation,
                "suggested_text": finding.suggested_text,
                "verification_status": "NEEDS_VERIFICATION",
                "evidence_chunk_ids": valid_ids,
                "needs_verification_reason": reason,
            }
        )
    return verified


def _persist_findings(
    db: Session,
    run: ValidationRun,
    findings: list[dict[str, Any]],
) -> None:
    for item in findings:
        db.add(
            ValidationFinding(
                id=new_id("find"),
                run_id=run.id,
                workspace_id=run.workspace_id,
                category=item["category"],
                severity=item["severity"],
                source=item["source"],
                rule_id=item.get("rule_id"),
                rule_version=item.get("rule_version"),
                snippet=item["snippet"][:2000],
                start_offset=item.get("start_offset"),
                end_offset=item.get("end_offset"),
                explanation=item["explanation"][:4000],
                suggested_text=item.get("suggested_text"),
                verification_status=item["verification_status"],
                evidence_chunk_ids=json.dumps(item.get("evidence_chunk_ids", [])),
                needs_verification_reason=item.get("needs_verification_reason"),
            )
        )


def _persist_evidence(
    db: Session,
    run: ValidationRun,
    chunks: list[RetrievedChunk],
) -> None:
    for chunk in chunks:
        db.add(
            ValidationEvidence(
                id=new_id("ev"),
                run_id=run.id,
                workspace_id=run.workspace_id,
                chunk_id=chunk.chunk_id,
                document_id=chunk.document_id,
                document_title=chunk.document_title,
                doc_type=chunk.doc_type,
                document_version=chunk.version,
                section_ref=chunk.section_ref,
                page_start=chunk.page_number,
                page_end=chunk.page_end,
                text=chunk.text,
            )
        )


def _sweep_stale_runs(db: Session, *, fingerprint: str, settings: Settings) -> None:
    """Mark crashed/interrupted runs for this fingerprint as failed.

    A run left ``pending``/``running`` (process crash, restart) older than
    the provider timeout window can never silently stay in-flight; this is
    what keeps restarts from producing inconsistent results.
    """
    cutoff = datetime.now(UTC) - timedelta(
        seconds=settings.gemini_timeout_seconds + LEASE_GRACE_SECONDS
    )
    stale = db.scalars(
        select(ValidationRun).where(
            ValidationRun.fingerprint == fingerprint,
            ValidationRun.state.in_(("pending", "running")),
            ValidationRun.created_at < cutoff,
        )
    ).all()
    for run in stale:
        run.state = "failed"
        run.error_code = "interrupted"
        run.partial_reason = run.partial_reason or "run interrupted before completion"
        run.completed_at = datetime.now(UTC)


def _take_cache_lease(
    db: Session,
    *,
    key_digest: str,
    workspace_id: str,
    settings: Settings,
    model_id: str,
    run_id: str,
) -> ValidationCache | None:
    """Return the cached result row, or take/refresh the in-flight lease.

    - Row with completed ``response_json`` and unexpired TTL: cache hit.
    - Row with NULL response (lease) younger than the timeout window: another
      identical request is executing right now -> InFlightRun (its run id is
      carried on the lease).
    - Stale lease: re-taken (crash recovery).
    """
    now = datetime.now(UTC)
    lease_window = timedelta(seconds=settings.gemini_timeout_seconds + LEASE_GRACE_SECONDS)
    row = db.scalar(select(ValidationCache).where(ValidationCache.key_digest == key_digest))
    if row is not None:
        if row.response_json is not None and as_utc(row.expires_at) > now:
            return row
        if row.response_json is None and as_utc(row.created_at) > now - lease_window:
            raise InFlightRun(row.run_id or "")
        # Expired cache or stale lease: reuse the row as a fresh lease.
        row.response_json = None
        row.created_at = now
        row.expires_at = now
        row.model_id = model_id
        row.run_id = run_id
        db.commit()
        return None
    db.add(
        ValidationCache(
            id=new_id("vc"),
            key_digest=key_digest,
            workspace_id=workspace_id,
            response_json=None,
            schema_version=CACHE_SCHEMA_VERSION,
            model_id=model_id,
            run_id=run_id,
            created_at=now,
            expires_at=now,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # Concurrent identical request won the lease insert.
        db.rollback()
        lease = db.scalar(select(ValidationCache).where(ValidationCache.key_digest == key_digest))
        raise InFlightRun(lease.run_id if lease and lease.run_id else "") from None
    return None


def _record_usage(
    db: Session,
    *,
    run: ValidationRun,
    model_id: str,
    outcome: str,
    result: Any = None,
) -> None:
    usage = ProviderUsage(
        id=new_id("pu"),
        workspace_id=run.workspace_id,
        run_id=run.id,
        model_id=model_id,
        outcome=outcome,
        prompt_tokens=getattr(result, "prompt_tokens", None),
        completion_tokens=getattr(result, "completion_tokens", None),
        total_tokens=getattr(result, "total_tokens", None),
        latency_ms=getattr(result, "latency_ms", None),
    )
    db.add(usage)
    if result is not None:
        run.prompt_tokens = result.prompt_tokens
        run.completion_tokens = result.completion_tokens
        run.total_tokens = result.total_tokens
        run.provider_latency_ms = result.latency_ms


def _release_lease(db: Session, key_digest: str) -> None:
    """Remove a pending lease so a later retry can take it (failures only)."""
    lease = db.scalar(select(ValidationCache).where(ValidationCache.key_digest == key_digest))
    if lease is not None and lease.response_json is None:
        db.delete(lease)
        db.commit()


def validate_content(
    db: Session,
    settings: Settings,
    provider: GeminiProvider,
    retrieval: FtsRetrievalService,
    *,
    actor: ActorWorkspace,
    submission: ContentSubmission,
    version: ContentVersion,
    idempotency_key: str | None,
) -> ValidatedRun:
    """Execute one hybrid validation run (synchronous; see module docstring)."""
    if version.submission_id != submission.id or version.workspace_id != actor.workspace.id:
        raise ValidationError(404, "Content version not found")
    text = version.text
    if not text.strip():
        raise ValidationError(422, "Submission text must not be empty")

    request_hash = sha256_hex(f"{submission.id}|{version.id}|{version.text_sha256}")

    # --- idempotency replay (no state change) -----------------------------
    if idempotency_key:
        existing = db.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.workspace_id == actor.workspace.id,
                IdempotencyRecord.route == ROUTE_VALIDATE,
                IdempotencyRecord.key == idempotency_key,
            )
        )
        if existing is not None:
            if existing.request_hash != request_hash:
                raise ValidationError(
                    409, "Idempotency key was already used with a different request payload"
                )
            replay = db.get(ValidationRun, existing.run_id)
            if replay is not None:
                return ValidatedRun(run=replay, idempotency_replay=True)

    # --- quotas (DB-backed; commits the counted events) --------------------
    _check_quotas(db, settings, actor)

    # --- deterministic stage (always on, no network) ------------------------
    rules = list(
        db.scalars(
            select(BrandRule).where(
                BrandRule.workspace_id == actor.workspace.id, BrandRule.enabled.is_(True)
            )
        ).all()
    )
    det_findings = run_deterministic(text, rules)

    # --- workspace-scoped evidence retrieval --------------------------------
    chunks = retrieval.search(
        db,
        workspace_id=actor.workspace.id,
        query=text,
        top_k=settings.validation_evidence_top_k,
    )
    evidence_by_chunk_id = {chunk.chunk_id: chunk for chunk in chunks}

    model_id = settings.gemini_model
    fingerprint = _fingerprint(
        workspace_id=actor.workspace.id,
        content_sha256=version.text_sha256,
        source_set_hash=_source_set_hash(chunks),
        rules_hash=_rules_hash(rules),
        prompt_version=settings.prompt_version,
        model_id=model_id,
    )

    _sweep_stale_runs(db, fingerprint=fingerprint, settings=settings)

    # The run row exists (state running) before the lease is taken so a
    # concurrent duplicate can always be pointed at an exact run.
    run = ValidationRun(
        id=new_id("run"),
        workspace_id=actor.workspace.id,
        submission_id=submission.id,
        content_version_id=version.id,
        requested_by=actor.user.id,
        state="running",
        ai_status="pending",
        fingerprint=fingerprint,
        source_set_hash=_source_set_hash(chunks),
        rules_hash=_rules_hash(rules),
        prompt_version=settings.prompt_version,
        model_id=model_id,
        idempotency_key=idempotency_key,
    )
    db.add(run)
    db.commit()  # run visible as `running` before any provider call
    db.refresh(run)

    # --- result cache / single-flight lease ---------------------------------
    try:
        cached_row = _take_cache_lease(
            db,
            key_digest=fingerprint,
            workspace_id=actor.workspace.id,
            settings=settings,
            model_id=model_id,
            run_id=run.id,
        )
    except InFlightRun as exc:
        # Another identical run is executing: drop our duplicate pending run
        # and return the one already in flight (no double provider spend).
        db.delete(run)
        db.commit()
        other = db.get(ValidationRun, exc.run_id) if exc.run_id else None
        if other is not None:
            return ValidatedRun(run=other, idempotency_replay=False)
        raise ValidationError(409, "An identical validation is already in progress") from exc

    ai_findings: list[dict[str, Any]] = []
    cache_hit = False
    try:
        if cached_row is not None:
            payload = json.loads(cached_row.response_json or "{}")
            ai_findings = payload.get("findings", [])
            cache_hit = True
            run.ai_status = "complete"
            run.cache_hit = True
        elif not provider.is_configured:
            run.ai_status = "unavailable"
            run.partial_reason = "ai_not_configured"
        elif _budget_exhausted(db, settings):
            run.ai_status = "skipped_budget"
            run.partial_reason = "provider_budget_exhausted"
        else:
            # Every real attempt (initial call and each retry) reserves its
            # budget atomically BEFORE network I/O — failed, timed-out and
            # rate-limited attempts consume capacity exactly like
            # successful ones, and concurrent distinct requests cannot
            # collectively overshoot the configured daily limits.
            estimated_tokens = _estimate_attempt_tokens(text, chunks, rules)
            budget_day = _budget_day()

            def _reserve_attempt() -> None:
                nonlocal budget_day
                reserved_day = _reserve_provider_budget(
                    db,
                    calls=1,
                    tokens=estimated_tokens,
                    calls_limit=settings.gemini_calls_per_day,
                    tokens_limit=settings.gemini_tokens_per_day,
                )
                if reserved_day is None:
                    raise ProviderBudgetExhausted()
                budget_day = reserved_day

            try:
                result = provider.analyze(
                    content=text,
                    evidence=_evidence_payload(chunks),
                    rules=[
                        {
                            "rule_id": rule.id,
                            "rule_version": rule.version,
                            "category": rule.category,
                            "rule_text": rule.rule_text,
                        }
                        for rule in rules
                    ],
                    reserve_attempt=_reserve_attempt,
                )
            except ProviderBudgetExhausted:
                # Lost the reservation race (or the peek was stale): the
                # request is never sent; the run reports honestly.
                run.ai_status = "skipped_budget"
                run.partial_reason = "provider_budget_exhausted"
            except ProviderRateLimited as exc:
                _record_usage(db, run=run, model_id=model_id, outcome="rate_limited")
                run.ai_status = "partial"
                run.partial_reason = "provider_rate_limited"
                run.error_code = "PROVIDER_RATE_LIMITED"
                logger.warning(
                    "Gemini 429 on run %s (retry_after=%s)", run.id, exc.retry_after_seconds
                )
            except ProviderTimeout:
                _record_usage(db, run=run, model_id=model_id, outcome="timeout")
                run.ai_status = "partial"
                run.partial_reason = "provider_timeout"
                run.error_code = "PROVIDER_TIMEOUT"
                logger.warning("Gemini timeout on run %s", run.id)
            except InvalidModelOutput as exc:
                _record_usage(db, run=run, model_id=model_id, outcome="invalid_output")
                run.ai_status = "partial"
                run.partial_reason = "invalid_ai_output"
                run.error_code = "AI_OUTPUT_INVALID"
                logger.warning("Gemini invalid output on run %s: %s", run.id, exc)
            except ProviderConfigError:
                run.ai_status = "unavailable"
                run.partial_reason = "ai_not_configured"
            except ProviderError as exc:
                _record_usage(db, run=run, model_id=model_id, outcome="error")
                run.ai_status = "partial"
                run.partial_reason = "provider_error"
                run.error_code = "PROVIDER_ERROR"
                logger.warning("Gemini error on run %s: %s", run.id, exc.message)
            except Exception:
                # Unexpected failure in the AI stage: the run is honestly
                # partial, never completed; the lease is released below.
                logger.exception("Unexpected AI-stage failure on run %s", run.id)
                run.ai_status = "partial"
                run.partial_reason = "internal_error"
                run.error_code = "INTERNAL_ERROR"
            else:
                _record_usage(db, run=run, model_id=model_id, outcome="ok", result=result)
                _reconcile_token_reservation(
                    db,
                    day=budget_day,
                    estimated=estimated_tokens,
                    actual=result.total_tokens,
                )
                run.ai_status = "complete"
                ai_findings = _verify_ai_findings(result.analysis, evidence_by_chunk_id, text)
                expires = datetime.now(UTC) + timedelta(hours=settings.validation_cache_ttl_hours)
                lease = db.scalar(
                    select(ValidationCache).where(ValidationCache.key_digest == fingerprint)
                )
                if lease is not None:
                    lease.response_json = json.dumps({"findings": ai_findings})
                    lease.expires_at = expires
    finally:
        if run.ai_status != "complete" and not cache_hit:
            _release_lease(db, fingerprint)

    # --- merge findings ------------------------------------------------------
    merged: list[dict[str, Any]] = []
    seen_det: set[tuple[str, str]] = set()
    for item in det_findings:
        merged.append(
            {
                "category": item.category,
                "severity": item.severity,
                "source": "deterministic",
                "rule_id": item.rule_id,
                "rule_version": item.rule_version,
                "snippet": item.snippet,
                "start_offset": item.start_offset,
                "end_offset": item.end_offset,
                "explanation": item.explanation,
                "suggested_text": item.suggested_text,
                "verification_status": "SUPPORTED",
                "evidence_chunk_ids": [],
                "needs_verification_reason": None,
            }
        )
        seen_det.add((item.category, item.snippet.lower()))
    for item in ai_findings:
        if (item["category"], item["snippet"].strip().lower()) in seen_det:
            continue  # deterministic engine already reported this issue
        merged.append(item)

    # --- persist run + findings + evidence atomically -------------------------
    _persist_evidence(db, run, chunks)
    _persist_findings(db, run, merged[: settings.validation_max_findings])
    run.state = "completed" if run.ai_status == "complete" else "partial"
    run.completed_at = datetime.now(UTC)
    submission.status = "validated" if run.state == "completed" else "partial"
    if idempotency_key:
        db.add(
            IdempotencyRecord(
                id=new_id("idm"),
                workspace_id=actor.workspace.id,
                route=ROUTE_VALIDATE,
                key=idempotency_key,
                request_hash=request_hash,
                run_id=run.id,
            )
        )
    try:
        db.commit()
    except IntegrityError:
        # Lost a same-key race at the unique constraint: the winner's run is
        # the authoritative result for this idempotency key.
        db.rollback()
        winner = db.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.workspace_id == actor.workspace.id,
                IdempotencyRecord.route == ROUTE_VALIDATE,
                IdempotencyRecord.key == idempotency_key or "",
            )
        )
        if winner is not None:
            replay = db.get(ValidationRun, winner.run_id)
            if replay is not None:
                return ValidatedRun(run=replay, idempotency_replay=True)
        raise
    db.refresh(run)
    return ValidatedRun(run=run, idempotency_replay=False)


def run_deterministic(text: str, rules: list[BrandRule]) -> list[DeterministicFinding]:
    return run_deterministic_rules(text, rules)
