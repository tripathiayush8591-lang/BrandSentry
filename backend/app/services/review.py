"""Human review policy. No provider calls or writes to engine-owned records."""

import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.db.models import (
    ContentSubmission,
    ContentVersion,
    Membership,
    ReviewDecision,
    ReviewState,
    User,
    ValidationRun,
    Workspace,
    new_id,
)
from app.schemas.review import DecisionOut, FinalDecisionRequest, FindingDecisionRequest
from app.services.identity import ActorWorkspace, as_utc


def context(
    db: Session, workspace_id: str, run_id: str
) -> tuple[ValidationRun, ContentSubmission, ContentVersion, bool]:
    run = db.scalar(
        select(ValidationRun).where(
            ValidationRun.id == run_id, ValidationRun.workspace_id == workspace_id
        )
    )
    if run is None:
        raise HTTPException(404, "Validation run not found")
    submission = db.get(ContentSubmission, run.submission_id)
    version = db.get(ContentVersion, run.content_version_id)
    if (
        submission is None
        or version is None
        or submission.workspace_id != workspace_id
        or version.workspace_id != workspace_id
        or version.submission_id != submission.id
    ):
        raise HTTPException(404, "Content version not found")
    latest_version = db.scalar(
        select(ContentVersion.id)
        .where(
            ContentVersion.submission_id == submission.id,
            ContentVersion.workspace_id == workspace_id,
        )
        .order_by(ContentVersion.version.desc())
        .limit(1)
    )
    latest_run = db.scalar(
        select(ValidationRun.id)
        .where(
            ValidationRun.content_version_id == version.id,
            ValidationRun.workspace_id == workspace_id,
        )
        .order_by(ValidationRun.created_at.desc(), ValidationRun.id.desc())
        .limit(1)
    )
    return run, submission, version, latest_version == version.id and latest_run == run.id


def history(db: Session, run_id: str) -> list[ReviewDecision]:
    return list(
        db.scalars(
            select(ReviewDecision)
            .where(ReviewDecision.run_id == run_id)
            .order_by(ReviewDecision.revision)
        )
    )


def finding_states(
    run: ValidationRun, decisions: list[ReviewDecision]
) -> tuple[list[str], list[str]]:
    latest = {d.finding_id: d.decision for d in decisions if d.finding_id is not None}
    unresolved = [f.id for f in run.findings if latest.get(f.id) not in {"accept", "reject"}]
    accepted = [f.id for f in run.findings if latest.get(f.id) == "accept"]
    return unresolved, accepted


def decision_out(event: ReviewDecision) -> DecisionOut:
    return DecisionOut(
        **{name: getattr(event, name) for name in DecisionOut.model_fields if name != "created_at"},
        created_at=as_utc(event.created_at).isoformat(),
    )


def record_decision(
    db: Session,
    actor: ActorWorkspace,
    run_id: str,
    finding_id: str | None,
    body: FindingDecisionRequest | FinalDecisionRequest,
    key: str,
) -> DecisionOut:
    # Auth dependencies have only read. End that read transaction before taking
    # SQLite's writer lock; re-read policy inputs under the lock. This covers
    # first-write races, finding vs final races, and distinct reviewer sessions.
    workspace_id, actor_id = actor.workspace.id, actor.user.id
    request_hash = hashlib.sha256(
        json.dumps(
            {"run_id": run_id, "finding_id": finding_id, **body.model_dump()}, sort_keys=True
        ).encode()
    ).hexdigest()
    db.rollback()
    try:
        db.execute(text("BEGIN IMMEDIATE"))
        membership = db.scalar(
            select(Membership).where(
                Membership.workspace_id == workspace_id, Membership.user_id == actor_id
            )
        )
        if membership is None or membership.role not in {"admin", "reviewer"}:
            raise HTTPException(403, "Your workspace role does not permit review")
        run, submission, version, current = context(db, workspace_id, run_id)
        if finding_id is not None and not any(f.id == finding_id for f in run.findings):
            raise HTTPException(404, "Finding not found in this validation run")
        workspace = db.get(Workspace, workspace_id)
        user = db.get(User, actor_id)
        is_demo = workspace.kind == "demo"
        if not is_demo and actor_id in {submission.created_by, version.created_by}:
            raise HTTPException(403, "Real content requires a separate reviewer identity")
        replay = db.scalar(
            select(ReviewDecision).where(
                ReviewDecision.workspace_id == workspace_id,
                ReviewDecision.actor_id == actor_id,
                ReviewDecision.idempotency_key == key,
            )
        )
        if replay is not None:
            if replay.request_hash != request_hash:
                raise HTTPException(409, "Idempotency key was already used for a different request")
            result = decision_out(replay)
            db.rollback()
            return result
        if not current:
            raise HTTPException(
                409, "Review requires the latest content version and validation run"
            )
        if run.state not in {"completed", "partial"}:
            raise HTTPException(409, "Only completed or partial validation runs can be reviewed")
        state = db.get(ReviewState, run_id)
        revision = state.revision if state else 0
        if body.expected_revision != revision:
            raise HTTPException(409, "Stale review revision; reload review detail")
        if state and state.final_decision:
            raise HTTPException(
                409, "Review is final; create a new validation run or content version"
            )
        notes = body.notes.strip() if body.notes else None
        if body.decision == "reject" and not notes:
            raise HTTPException(422, "Dismissing a finding requires human justification in notes")
        if finding_id is None:
            unresolved, accepted = finding_states(run, history(db, run_id))
            if unresolved:
                raise HTTPException(
                    409, "Every finding must be accepted or rejected before final review"
                )
            if body.decision == "approve" and (
                accepted or run.state != "completed" or run.ai_status != "complete"
            ):
                raise HTTPException(
                    409, "Approval requires complete validation and no accepted issues"
                )
        if state is None:
            state = ReviewState(run_id=run_id, revision=0)
            db.add(state)
        state.revision = revision + 1
        if finding_id is None:
            state.final_decision = body.decision
        event = ReviewDecision(
            id=new_id("rev"),
            workspace_id=workspace_id,
            run_id=run_id,
            finding_id=finding_id,
            actor_id=actor_id,
            actor_name=user.display_name,
            actor_role=membership.role,
            is_demo=is_demo,
            revision=state.revision,
            decision=body.decision,
            notes=notes or None,
            idempotency_key=key,
            request_hash=request_hash,
        )
        db.add(event)
        db.flush()
        result = decision_out(event)
        db.commit()
        return result
    except (IntegrityError, OperationalError) as exc:
        db.rollback()
        # Only lock contention/constraint races are client conflicts. Other
        # database faults must retain the standard safe server-error handling.
        if isinstance(exc, OperationalError) and not any(
            marker in str(exc.orig).lower() for marker in ("locked", "busy")
        ):
            raise
        raise HTTPException(409, "Concurrent review conflict; reload and retry") from exc
    except Exception:
        db.rollback()
        raise
