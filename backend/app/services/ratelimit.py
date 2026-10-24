"""DB-backed sliding-window rate limits for expensive operations.

No external Redis: a single-service SQLite MVP counts event rows per
(scope, key) over a rolling window (docs/AI_VALIDATION.md §6 — limits must be
server-side and survive restart). Old rows are pruned opportunistically.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import RateLimitEvent, new_id

SCOPE_UPLOAD = "knowledge_upload"
SCOPE_SEARCH = "knowledge_search"


class RateLimitExceeded(Exception):
    def __init__(self, scope: str, retry_after_seconds: int) -> None:
        self.scope = scope
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"rate limit exceeded for {scope}")


def check_rate_limit(
    db: Session,
    *,
    scope: str,
    key: str,
    limit: int,
    window_seconds: int = 3600,
) -> None:
    """Raise :class:`RateLimitExceeded` if ``limit`` events already recorded.

    Records a new event when the call succeeds past the check. ``limit <= 0``
    disables the limit for that scope.
    """
    if limit <= 0 or not key:
        return
    window_start = datetime.now(UTC) - timedelta(seconds=window_seconds)
    conditions = (
        RateLimitEvent.scope == scope,
        RateLimitEvent.object_key == key,
        RateLimitEvent.created_at > window_start,
    )
    count = db.scalar(select(func.count()).select_from(RateLimitEvent).where(*conditions)) or 0
    if count >= limit:
        oldest = db.scalar(
            select(RateLimitEvent)
            .where(*conditions)
            .order_by(RateLimitEvent.created_at.asc())
            .limit(1)
        )
        retry_after = 1
        if oldest is not None:
            created = oldest.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            retry_after = (
                int(
                    (
                        created + timedelta(seconds=window_seconds) - datetime.now(UTC)
                    ).total_seconds()
                )
                + 1
            )
        raise RateLimitExceeded(scope, max(1, retry_after))

    db.add(RateLimitEvent(id=new_id("rle"), scope=scope, object_key=key[:120]))
    # Opportunistic pruning keeps the table small without a background job.
    db.execute(
        delete(RateLimitEvent).where(
            RateLimitEvent.scope == scope, RateLimitEvent.created_at <= window_start
        )
    )
    # GET-only callers never hit another commit; persist the counted event now
    # so limits survive restarts and apply to read-only operations.
    db.commit()
