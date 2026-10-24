"""Shared Phase 3A knowledge-vault test helpers.

Synthetic brand documents only — no personal or confidential content. All
coverage here is MOCK-free at the provider level (no external provider is
involved) and LIVE_BACKEND at the SQLite/HTTP level.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pymupdf
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Settings
from app.db.models import Membership
from app.main import create_app

GUIDELINE_TEXT = (
    "# Brand Guidelines\n\n"
    "Never promise guaranteed outcomes in any marketing material.\n\n"
    "The preferred product name is EcoBlend, capitalised exactly like that.\n\n"
    "All claims about ingredients must cite the approved claims register."
)


def knowledge_settings(tmp_path: Path, **overrides: object) -> Settings:
    defaults: dict[str, object] = {
        "app_env": "development",
        "database_url": f"sqlite:///{(tmp_path / 'knowledge.sqlite').as_posix()}",
        "upload_dir": str(tmp_path / "uploads"),
        "frontend_origins": "http://localhost:5173,http://127.0.0.1:5173",
        "log_level": "WARNING",
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def make_client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as client:
        yield client


def guest_session(client: TestClient) -> dict[str, str]:
    """Create a guest session; returns CSRF header map for mutations."""
    response = client.post("/api/v1/auth/guest")
    assert response.status_code == 201, response.text
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def change_session_role(client: TestClient, role: str) -> None:
    """Rewrite the current session actor's membership role directly in the DB.

    Roles are server-assigned; tests exercise the authorisation path by
    changing the server-side record, never by sending client role input.
    """
    me = client.get("/api/v1/auth/me").json()
    workspace_id = me["workspace"]["id"]
    user_id = me["user"]["id"]
    factory = client.app.state.session_factory
    with factory() as db:
        membership = db.scalar(
            select(Membership).where(
                Membership.workspace_id == workspace_id, Membership.user_id == user_id
            )
        )
        assert membership is not None
        membership.role = role
        db.commit()


def upload_text(
    client: TestClient,
    headers: dict[str, str],
    *,
    title: str = "Brand Guidelines",
    content: str = GUIDELINE_TEXT,
    doc_type: str = "guidelines",
) -> dict:
    response = client.post(
        "/api/v1/knowledge/documents",
        files={"file": (f"{title}.txt", content.encode("utf-8"), "text/plain")},
        data={"title": title, "doc_type": doc_type},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_and_approve(
    client: TestClient,
    headers: dict[str, str],
    *,
    title: str = "Brand Guidelines",
    content: str = GUIDELINE_TEXT,
    doc_type: str = "guidelines",
) -> dict:
    payload = upload_text(client, headers, title=title, content=content, doc_type=doc_type)
    document_id = payload["document"]["id"]
    approval = client.post(f"/api/v1/knowledge/documents/{document_id}/approve", headers=headers)
    assert approval.status_code == 200, approval.text
    payload["document"]["status"] = "approved"
    return payload


def make_pdf(pages: list[str], *, encrypt: bool = False) -> bytes:
    """Build a real text-based PDF (synthetic content) with PyMuPDF."""
    doc = pymupdf.open()
    for page_text in pages:
        page = doc.new_page()
        page.insert_textbox(page.rect + (50, 50, -50, -50), page_text, fontsize=12)
    data: bytes
    if encrypt:
        data = doc.tobytes(
            encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner-secret", user_pw="user-secret"
        )
    else:
        data = doc.tobytes()
    doc.close()
    return data


def upload_bytes(
    client: TestClient,
    headers: dict[str, str],
    raw: bytes,
    *,
    filename: str = "upload.bin",
    title: str = "Binary upload",
    doc_type: str = "source_document",
) -> object:
    """Upload raw bytes with a possibly misleading extension (content sniffing)."""
    return client.post(
        "/api/v1/knowledge/documents",
        files={"file": (filename, raw, "application/octet-stream")},
        data={"title": title, "doc_type": doc_type},
        headers=headers,
    )
