"""Minimal human-review routes; existing run/submission APIs remain stable."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy import text

from app.api.deps import CsrfVerified, CurrentActor, DbSession, require_roles
from app.api.v1.validation import _run_out
from app.db.models import ReviewState
from app.schemas.review import (
    DecisionOut,
    FinalDecisionRequest,
    FindingDecisionRequest,
    ReviewDetailOut,
)
from app.services import review as service
from app.services.identity import ActorWorkspace

router = APIRouter(tags=["review"])
Reviewer = Annotated[ActorWorkspace, Depends(require_roles("admin", "reviewer"))]
IdempotencyKey = Annotated[
    str, Header(alias="Idempotency-Key", min_length=1, max_length=120, pattern=r"^[!-~]+$")
]


@router.get("/validation-runs/{run_id}/review", response_model=ReviewDetailOut)
def get_review(run_id: str, db: DbSession, actor: CurrentActor) -> ReviewDetailOut:
    workspace_id, is_demo = actor.workspace.id, actor.workspace.kind == "demo"
    # Python sqlite3 legacy transaction mode does not BEGIN for SELECTs.
    # Take one read snapshot so revision, projection and history agree even
    # if a writer commits between the individual SELECTs below.
    db.rollback()
    db.execute(text("BEGIN"))
    run, _, version, current = service.context(db, workspace_id, run_id)
    state = db.get(ReviewState, run_id)
    decisions = service.history(db, run_id)
    unresolved, accepted = service.finding_states(run, decisions)
    blockers = []
    if not current:
        blockers.append("stale_run")
    if run.state != "completed" or run.ai_status != "complete":
        blockers.append("incomplete_validation")
    if unresolved:
        blockers.append("unresolved_findings")
    if accepted:
        blockers.append("accepted_issues")
    if state and state.final_decision:
        blockers.append("review_final")
    status = {"approve": "approved", "request_changes": "changes_requested"}.get(
        state.final_decision if state else None, "in_review" if decisions else "pending"
    )
    return ReviewDetailOut(
        run=_run_out(run),
        content_text=version.text,
        revision=state.revision if state else 0,
        status=status,
        is_current=current,
        is_demo=is_demo,
        unresolved_finding_ids=unresolved,
        accepted_finding_ids=accepted,
        approval_blockers=blockers,
        decisions=[service.decision_out(d) for d in decisions],
    )


@router.post("/validation-runs/{run_id}/review/findings/{finding_id}", response_model=DecisionOut)
def decide_finding(
    run_id: str,
    finding_id: str,
    body: FindingDecisionRequest,
    db: DbSession,
    actor: Reviewer,
    _csrf: CsrfVerified,
    idempotency_key: IdempotencyKey,
) -> DecisionOut:
    return service.record_decision(db, actor, run_id, finding_id, body, idempotency_key)


@router.post("/validation-runs/{run_id}/review/decision", response_model=DecisionOut)
def decide_submission(
    run_id: str,
    body: FinalDecisionRequest,
    db: DbSession,
    actor: Reviewer,
    _csrf: CsrfVerified,
    idempotency_key: IdempotencyKey,
) -> DecisionOut:
    return service.record_decision(db, actor, run_id, None, body, idempotency_key)
