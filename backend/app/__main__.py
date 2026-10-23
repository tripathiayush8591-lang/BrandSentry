"""Entrypoint: ``python -m app``.

Reads HOST/PORT behaviour from settings: Railway injects PORT at runtime and
the bind host defaults to 0.0.0.0 outside development, so the same command
works locally and when deployed. Nothing is hardcoded.
"""

from __future__ import annotations

import uvicorn

from app.config import get_settings


def run() -> None:
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.bind_host,
        port=settings.port,
        log_level=settings.log_level.strip().lower(),
    )


if __name__ == "__main__":
    run()
