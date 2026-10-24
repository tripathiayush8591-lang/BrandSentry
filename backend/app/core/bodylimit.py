"""Early request-body limits (Phase 4A finding 7).

Starlette buffers/spools request bodies before endpoint-level checks run, so
before this middleware a multi-gigabyte upload could consume memory/disk
before the knowledge-upload cap was applied. Caps are enforced **before** the
app sees body data:

- A ``Content-Length`` above the applicable cap is rejected with the standard
  413 error contract without starting the application.
- Chunked/streamed bodies (no ``Content-Length``) are counted as they stream;
  the request aborts with 413 the moment the cap is exceeded (the exception is
  raised from the body stream, i.e. inside the endpoint's body read, so the
  registered exception handler still produces the JSON error contract).
- Caps are chosen per content type: multipart (knowledge upload cap plus form
  encoding overhead), JSON (API payloads) and a general default.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable

from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_id import get_request_id

logger = logging.getLogger(__name__)

_MULTIPART = b"multipart/"
_JSON = b"application/json"

_TOO_LARGE_MESSAGE = "Request body exceeds the maximum allowed size."


def _too_large_body(message: str) -> bytes:
    """Error-contract JSON for the pre-app 413 rejection."""
    return json.dumps(
        {"error": {"code": "PAYLOAD_TOO_LARGE", "message": message, "request_id": get_request_id()}}
    ).encode("utf-8")


class BodyLimitMiddleware:
    """Reject oversized request bodies before buffering them."""

    def __init__(
        self,
        app: Callable[..., Awaitable[None]],
        *,
        multipart_limit: int,
        json_limit: int,
        default_limit: int,
    ) -> None:
        self.app = app
        self.multipart_limit = multipart_limit
        self.json_limit = json_limit
        self.default_limit = default_limit

    def _cap_for(self, headers: dict[bytes, bytes]) -> int:
        content_type = headers.get(b"content-type", b"")
        if content_type.lower().startswith(_MULTIPART):
            return self.multipart_limit
        if content_type.lower().startswith(_JSON):
            return self.json_limit
        return self.default_limit

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers: dict[bytes, bytes] = {}
        for name, value in scope.get("headers", []):
            headers.setdefault(name.lower(), value)
        cap = self._cap_for(headers)

        raw_length = headers.get(b"content-length")
        if raw_length is not None:
            try:
                if int(raw_length) > cap:
                    logger.warning(
                        "Rejected %s request with Content-Length %s (cap %d)",
                        scope.get("method"),
                        raw_length.decode("ascii", "replace"),
                        cap,
                    )
                    await self._reject(send)
                    return
            except ValueError:
                # Malformed Content-Length: let the server/app handle it.
                pass

        received = 0

        async def counting_receive() -> dict:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > cap:
                    # Starlette's HTTPException survives FastAPI's broad
                    # body-read error wrapper (custom exceptions would be
                    # masked into a misleading 400) and is mapped to the
                    # standard 413 error contract by the app's handler.
                    raise StarletteHTTPException(status_code=413, detail=_TOO_LARGE_MESSAGE)
            return message

        await self.app(scope, counting_receive, send)

    async def _reject(self, send: Callable) -> None:
        body = _too_large_body("Request body exceeds the maximum allowed size.")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
