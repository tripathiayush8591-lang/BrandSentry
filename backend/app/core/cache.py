"""Private-response cache policy (Phase 4A finding 6).

Every BrandSentry response is session-scoped (cookies, CSRF, workspace data)
or operational status, so nothing may be stored by shared caches or the
browser cache. The header is stamped at the origin for **every** response,
including errors and cookie issuance/deletion; the same-origin edge
configuration (frontend/vercel.json) adds matching CDN directives.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

CACHE_CONTROL_VALUE = "private, no-store"


class CacheControlMiddleware:
    """Pure-ASGI middleware stamping ``Cache-Control: private, no-store``.

    Never overrides a more restrictive header the app may have set itself,
    and never caches anything by default.
    """

    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_cache_policy(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                if b"cache-control" not in present:
                    headers.append((b"cache-control", CACHE_CONTROL_VALUE.encode("ascii")))
            await send(message)

        await self.app(scope, receive, send_with_cache_policy)
