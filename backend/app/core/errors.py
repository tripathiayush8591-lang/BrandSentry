"""Consistent JSON error contract.

Every failure returns::

    {"error": {"code": "<STABLE_CODE>", "message": "<safe message>", "request_id": "req_..."}}

aligned with docs/DATA_API_CONTRACTS.md §5. Messages never leak internals for
5xx errors; details go to server logs together with the request ID.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_id import REQUEST_ID_HEADER, get_request_id

logger = logging.getLogger(__name__)

_STATUS_CODE_TO_ERROR_CODE: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
}

_GENERIC_INTERNAL_MESSAGE = "An unexpected error occurred. Please retry later."


def error_code_for_status(status_code: int) -> str:
    return _STATUS_CODE_TO_ERROR_CODE.get(status_code, f"HTTP_{status_code}")


def build_error_response(
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = get_request_id()
    body = {"error": {"code": code, "message": message, "request_id": request_id}}
    response = JSONResponse(status_code=status_code, content=body)
    if headers:
        for name, value in headers.items():
            response.headers[name] = value
    response.headers[REQUEST_ID_HEADER] = request_id
    return response


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        message = str(exc.detail) if exc.detail else error_code_for_status(exc.status_code)
        return build_error_response(
            status_code=exc.status_code,
            code=error_code_for_status(exc.status_code),
            message=message,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Report field locations and messages only; never echo raw input values.
        problems = [
            {"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
            for error in exc.errors()
        ]
        return build_error_response(
            status_code=422,
            code="VALIDATION_ERROR",
            message=f"Request validation failed: {problems}",
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception(
            "Unhandled error on %s %s (request_id=%s): %s",
            request.method,
            request.url.path,
            get_request_id(),
            exc,
        )
        return build_error_response(
            status_code=500,
            code="INTERNAL_ERROR",
            message=_GENERIC_INTERNAL_MESSAGE,
        )
