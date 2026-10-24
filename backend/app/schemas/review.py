"""Version-specific human review API; engine schemas remain unchanged."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.validation import ValidationRunOut


class FindingDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0, strict=True)
    decision: Literal["accept", "reject", "flag"]
    notes: str | None = Field(default=None, max_length=2000)


class FinalDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0, strict=True)
    decision: Literal["approve", "request_changes"]
    notes: str | None = Field(default=None, max_length=2000)


class DecisionOut(BaseModel):
    id: str
    run_id: str
    finding_id: str | None
    revision: int
    decision: str
    notes: str | None
    actor_id: str
    actor_name: str
    actor_role: str
    is_demo: bool
    created_at: str


class ReviewDetailOut(BaseModel):
    run: ValidationRunOut
    content_text: str
    revision: int
    status: Literal["pending", "in_review", "approved", "changes_requested"]
    is_current: bool
    is_demo: bool
    unresolved_finding_ids: list[str]
    accepted_finding_ids: list[str]
    approval_blockers: list[str]
    decisions: list[DecisionOut]
