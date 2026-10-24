"""Phase 3A document ingestion tests: validation, extraction, versioning.

Coverage class: LIVE_BACKEND (real SQLite, real filesystem uploads, real
PyMuPDF extraction). No external provider is involved in this phase.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers_3a import (
    GUIDELINE_TEXT,
    guest_session,
    knowledge_settings,
    make_client,
    make_pdf,
    upload_and_approve,
    upload_bytes,
    upload_text,
)


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    yield from make_client(knowledge_settings(tmp_path))


def test_valid_txt_upload_returns_metadata(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_text(client, headers, title="Brand Guidelines")

    document = payload["document"]
    assert document["status"] == "pending"  # approval is a separate admin step
    assert document["doc_type"] == "guidelines"
    assert document["active_version"] == 1

    version = payload["version"]
    assert version["content_type"] == "text/plain"
    assert version["extraction_status"] == "extracted"
    assert len(version["checksum_sha256"]) == 64
    assert version["original_filename"] == "Brand Guidelines.txt"
    assert payload["created_new_version"] is True

    chunks = client.get(
        f"/api/v1/knowledge/documents/{document['id']}/chunks", headers=headers
    ).json()["chunks"]
    assert payload["chunk_count"] == len(chunks) > 0
    joined = " ".join(chunk["text"] for chunk in chunks)
    assert "Never promise guaranteed outcomes" in joined
    assert all(chunk["page_number"] is None for chunk in chunks)  # plain text has no pages


def test_valid_pdf_upload_extracts_pages(client: TestClient) -> None:
    headers = guest_session(client)
    pdf_bytes = make_pdf(
        [
            "Section one: the brand colour palette is defined in appendix A.",
            "Section two: never use the discontinued logo variant.",
            "Section three: captions must be at least twelve characters long.",
        ]
    )
    response = client.post(
        "/api/v1/knowledge/documents",
        files={"file": ("brandbook.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Brandbook", "doc_type": "guidelines"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["version"]["content_type"] == "application/pdf"
    assert payload["version"]["page_count"] == 3
    assert payload["version"]["extraction_status"] == "extracted"

    chunks = client.get(
        f"/api/v1/knowledge/documents/{payload['document']['id']}/chunks", headers=headers
    ).json()["chunks"]
    pages = {chunk["page_number"] for chunk in chunks}
    assert pages and pages.issubset({1, 2, 3})
    joined = " ".join(chunk["text"] for chunk in chunks)
    assert "discontinued logo variant" in joined


def test_unsupported_binary_rejected_by_content_inspection(client: TestClient) -> None:
    headers = guest_session(client)
    # PNG magic bytes with a .txt extension: the extension must not win.
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    response = upload_bytes(client, headers, png, filename="image.txt")
    assert response.status_code == 400
    assert (
        "Unsupported" in response.json()["error"]["message"]
        or "UTF-8" in response.json()["error"]["message"]
    )


def test_corrupt_pdf_rejected_gracefully(client: TestClient) -> None:
    headers = guest_session(client)
    response = upload_bytes(
        client, headers, b"%PDF-1.7 this is not really a pdf at all", filename="broken.pdf"
    )
    assert response.status_code == 400


def test_encrypted_pdf_rejected_gracefully(client: TestClient) -> None:
    headers = guest_session(client)
    encrypted = make_pdf(["Secret guidance inside."], encrypt=True)
    response = upload_bytes(client, headers, encrypted, filename="locked.pdf")
    assert response.status_code == 400
    assert "Encrypt" in response.json()["error"]["message"]


def test_oversized_document_rejected_413(tmp_path: Path) -> None:
    settings = knowledge_settings(tmp_path, knowledge_max_upload_bytes=100)
    with TestClient(create_app(settings)) as client:
        headers = guest_session(client)
        response = client.post(
            "/api/v1/knowledge/documents",
            files={"file": ("big.txt", b"x" * 500, "text/plain")},
            data={"title": "Too big", "doc_type": "source_document"},
            headers=headers,
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_empty_document_rejected(client: TestClient) -> None:
    headers = guest_session(client)
    for raw in (b"", b"   \n\n  \t\n"):
        response = upload_bytes(client, headers, raw, filename="empty.txt")
        assert response.status_code == 400
        assert "text" in response.json()["error"]["message"].lower()

    blank_pdf = make_pdf([""])  # one page, no extractable text
    response = upload_bytes(client, headers, blank_pdf, filename="blank.pdf")
    assert response.status_code == 400


def test_pdf_without_extractable_text_rejected(client: TestClient) -> None:
    headers = guest_session(client)
    # A page whose only drawing is a rectangle yields no text; no OCR in this phase.
    doc = pymupdf.open()
    doc.new_page().draw_rect((50, 50, 200, 200))
    response = upload_bytes(client, headers, doc.tobytes(), filename="visual.pdf")
    doc.close()
    assert response.status_code == 400


def test_duplicate_upload_is_idempotent(client: TestClient) -> None:
    headers = guest_session(client)
    first = upload_text(client, headers, title="Brand Guidelines")
    second = upload_text(client, headers, title="Brand Guidelines")
    assert second["created_new_version"] is False
    assert second["version"]["id"] == first["version"]["id"]
    assert second["document"]["active_version"] == 1

    # Identical bytes under a different title are a separate document.
    other = upload_text(client, headers, title="Copy of Guidelines")
    assert other["created_new_version"] is True
    assert other["document"]["id"] != first["document"]["id"]


def test_reupload_creates_new_version_and_resets_approval(client: TestClient) -> None:
    headers = guest_session(client)
    first = upload_and_approve(client, headers, title="Brand Guidelines")
    document_id = first["document"]["id"]
    assert first["document"]["status"] == "approved"

    revised = upload_text(
        client,
        headers,
        title="Brand Guidelines",
        content=GUIDELINE_TEXT + "\n\nNew rule: always pair the logo with clear space.",
    )
    assert revised["created_new_version"] is True
    assert revised["document"]["active_version"] == 2
    # New content is unapproved until an authorised role approves it again.
    assert revised["document"]["status"] == "pending"

    search = client.get("/api/v1/knowledge/search", params={"q": "discontinued"}).json()
    assert search["results"] == []  # unapproved new version is not searchable

    approve = client.post(f"/api/v1/knowledge/documents/{document_id}/approve", headers=headers)
    assert approve.status_code == 200
    search = client.get("/api/v1/knowledge/search", params={"q": "clear space"}).json()
    assert len(search["results"]) == 1
    assert search["results"][0]["version"] == 2


def test_version_history_preserved_and_old_chunks_removed(client: TestClient) -> None:
    headers = guest_session(client)
    first = upload_text(client, headers, title="Brand Guidelines")
    document_id = first["document"]["id"]
    upload_text(client, headers, title="Brand Guidelines", content="Replacement content entirely.")
    detail = client.get(f"/api/v1/knowledge/documents/{document_id}", headers=headers).json()
    assert [v["version"] for v in detail["versions"]] == [1, 2]
    chunks_v1 = client.get(
        f"/api/v1/knowledge/documents/{document_id}/chunks", params={"version": 1}, headers=headers
    ).json()["chunks"]
    assert chunks_v1 == []  # superseded chunks leave the index


def test_failed_ingestion_leaves_no_partial_document(client: TestClient) -> None:
    headers = guest_session(client)
    rejected = upload_bytes(client, headers, b"\x89PNG not text", filename="bad.txt")
    assert rejected.status_code == 400
    listing = client.get("/api/v1/knowledge/documents", headers=headers).json()
    assert listing["documents"] == []


def test_stored_file_lives_in_workspace_scoped_path(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_text(client, headers)
    # Storage paths are deliberately hidden from API responses; verify via DB.
    from sqlalchemy import select

    from app.db.models import KnowledgeDocumentVersion

    factory = client.app.state.session_factory
    with factory() as db:
        version = db.scalar(
            select(KnowledgeDocumentVersion).where(
                KnowledgeDocumentVersion.document_id == payload["document"]["id"]
            )
        )
        assert version is not None
        storage_path = Path(version.storage_path)
    assert storage_path.exists()
    assert "workspaces" in storage_path.parts
    # Stored under the configured upload dir, outside any served static dir.
    assert client.app.state.settings.upload_dir in str(storage_path)


def test_title_conflict_between_workspaces_allowed(client: TestClient, tmp_path: Path) -> None:
    """The same title can exist in two isolated workspaces."""
    settings = knowledge_settings(tmp_path)
    with TestClient(create_app(settings)) as c:
        headers_a = guest_session(c)
        upload_text(c, headers_a, title="Shared Title")
    with TestClient(create_app(settings)) as c:
        headers_b = guest_session(c)
        payload = upload_text(c, headers_b, title="Shared Title")
        assert payload["document"]["status"] == "pending"
