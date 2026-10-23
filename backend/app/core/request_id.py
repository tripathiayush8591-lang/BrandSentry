"""Request-ID middleware.

Every response carries an ``X-Request-ID`` header: the caller-supplied value
when it is safely formatted, otherwise a generated ``req_<hex>``. The active
request ID is exposed to handlers and error handlers via a ContextVar so error
bodies can reference it.
"""

from __future__ import annotations

import contextvars
import re
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_REQUEST_ID_VAR: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)

REQUEST_ID_HEADER = "X-Request-ID"
_MAX_ID_LENGTH = 100
_SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def generate_request_id() -> str:
    return f"req_{uuid.uuid4().hex}"


def _sanitize_request_id(raw: str | None) -> str:
    """Accept only well-formed IDs so headers/logs cannot be injected into."""
    if raw and len(raw) <= _MAX_ID_LENGTH and _SAFE_ID_PATTERN.match(raw):
        return raw
    return generate_request_id()


def get_request_id() -> str:
    """Current request ID, generating a fresh one outside a request context."""
    return _REQUEST_ID_VAR.get() or generate_request_id()


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = _sanitize_request_id(request.headers.get(REQUEST_ID_HEADER))
        # Deliberately not reset after the response: unhandled exceptions must
        # still find the ID in the outer error handler's context.
        _REQUEST_ID_VAR.set(request_id)
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
