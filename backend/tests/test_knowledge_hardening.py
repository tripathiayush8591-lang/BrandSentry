"""Phase 3A hardening regression tests.

Covers the three corrections from the hardening pass:
1. extraction-cap truncation is reported (``incomplete``), never silent;
2. duplicate-title uploads (concurrent race, or after soft-delete) produce a
   controlled conflict instead of an unhandled IntegrityError / HTTP 500;
3. chunks merged across PDF page boundaries report their full page span.

All coverage is LIVE_BACKEND (real SQLite, filesystem, PyMuPDF); no provider.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import knowledge as knowledge_service
from tests.helpers_3a import (
    GUIDELINE_TEXT,
    guest_session,
    knowledge_settings,
    make_client,
    make_pdf,
    upload_bytes,
    upload_text,
)


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    yield from make_client(knowledge_settings(tmp_path))


# ---------------------------------------------------------------------------
# 1. Truncation is reported, not silent
# ---------------------------------------------------------------------------


def test_truncated_txt_reports_incomplete_extraction(tmp_path: Path) -> None:
    settings = knowledge_settings(tmp_path, knowledge_max_extracted_chars=100)
    with TestClient(create_app(settings)) as client:
        headers = guest_session(client)
        response = upload_bytes(
            client,
            headers,
            ("word " * 100).encode("utf-8"),
            filename="long.txt",
            title="Long text",
        )
        assert response.status_code == 201, response.text
        payload = response.json()
        assert payload["version"]["extraction_status"] == "incomplete"
        chunks = client.get(
            f"/api/v1/knowledge/documents/{payload['document']['id']}/chunks",
            headers=headers,
        ).json()["chunks"]
        assert chunks  # partial content is still stored and searchable


def test_truncated_pdf_reports_incomplete_extraction(tmp_path: Path) -> None:
    settings = knowledge_settings(tmp_path, knowledge_max_extracted_chars=150)
    with TestClient(create_app(settings)) as client:
        headers = guest_session(client)
        pdf_bytes = make_pdf(
            [f"Page {n} carries synthetic guidance text for extraction." for n in range(1, 5)]
        )
        response = upload_bytes(client, headers, pdf_bytes, filename="long.pdf", title="Long pdf")
        assert response.status_code == 201, response.text
        payload = response.json()
        assert payload["version"]["page_count"] == 4
        assert payload["version"]["extraction_status"] == "incomplete"


def test_within_cap_extraction_still_reports_extracted(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_text(client, headers, title="Normal Guidelines")
    assert payload["version"]["extraction_status"] == "extracted"
    pdf_payload = upload_bytes(
        client,
        headers,
        make_pdf(["Short guidance on one page."]),
        filename="short.pdf",
        title="Short pdf",
    )
    assert pdf_payload.status_code == 201
    assert pdf_payload.json()["version"]["extraction_status"] == "extracted"


# ---------------------------------------------------------------------------
# 2. Duplicate-title conflicts are controlled
# ---------------------------------------------------------------------------


def test_concurrent_duplicate_title_returns_409(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Two uploads racing past the title check: the loser gets 409, not 500.

    The race is simulated by hiding the title lookup (as if the other
    transaction had not committed yet); the unique constraint then rejects the
    insert and the service must translate that into a stable conflict.
    """
    headers = guest_session(client)
    first = upload_text(client, headers, title="Race Doc")
    assert first["created_new_version"] is True

    monkeypatch.setattr(
        knowledge_service, "_find_document_by_title", lambda db, workspace_id, title: None
    )
    response = upload_bytes(
        client,
        headers,
        GUIDELINE_TEXT.encode("utf-8"),
        filename="Race Doc.txt",
        title="Race Doc",
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"
    assert "already exists" in response.json()["error"]["message"]

    monkeypatch.undo()
    listing = client.get("/api/v1/knowledge/documents", headers=headers).json()
    assert [d["id"] for d in listing["documents"]] == [first["document"]["id"]]


def test_reupload_after_delete_reactivates_document(client: TestClient) -> None:
    """A soft-deleted title can be re-created; version numbering continues."""
    headers = guest_session(client)
    first = upload_text(client, headers, title="Recyclable Title")
    document_id = first["document"]["id"]
    deleted = client.delete(f"/api/v1/knowledge/documents/{document_id}", headers=headers)
    assert deleted.status_code == 204

    recreated = upload_text(
        client,
        headers,
        title="Recyclable Title",
        content=GUIDELINE_TEXT + "\n\nFresh content after deletion.",
    )
    # The unique (workspace, title) row is reactivated, not duplicated.
    assert recreated["document"]["id"] == document_id
    assert recreated["document"]["status"] == "pending"
    assert recreated["document"]["active_version"] == 2
    assert recreated["version"]["version"] == 2

    detail = client.get(f"/api/v1/knowledge/documents/{document_id}", headers=headers).json()
    assert [v["version"] for v in detail["versions"]] == [1, 2]  # audit trail kept


def test_deleted_title_idempotent_reupload_same_bytes(client: TestClient) -> None:
    headers = guest_session(client)
    first = upload_text(client, headers, title="Same Bytes")
    document_id = first["document"]["id"]
    assert (
        client.delete(f"/api/v1/knowledge/documents/{document_id}", headers=headers).status_code
        == 204
    )
    # Identical bytes after delete start a fresh active version (not a no-op:
    # the document was deleted, so a new active version must exist).
    payload = upload_text(client, headers, title="Same Bytes")
    assert payload["document"]["id"] == document_id
    assert payload["created_new_version"] is True
    assert payload["document"]["active_version"] == 2


# ---------------------------------------------------------------------------
# 3. Page spans are accurate for chunks crossing PDF pages
# ---------------------------------------------------------------------------


def test_pdf_chunk_reports_full_page_span(client: TestClient) -> None:
    headers = guest_session(client)
    # Small pages: every section fits into one chunk that merges across pages.
    pdf_bytes = make_pdf(
        [
            "Alpha section about colours.\n\nBeta section about logos.",
            "Gamma section about tone of voice.",
            "Delta section about claims.",
        ]
    )
    payload = upload_bytes(
        client, headers, pdf_bytes, filename="span.pdf", title="Spanning pdf"
    ).json()
    chunks = client.get(
        f"/api/v1/knowledge/documents/{payload['document']['id']}/chunks", headers=headers
    ).json()["chunks"]
    assert chunks
    joined = " ".join(chunk["text"] for chunk in chunks)
    for marker in ("Alpha", "Beta", "Gamma", "Delta"):
        assert marker in joined
    # Content from all three pages merged into one chunk: the span covers 1..3.
    spanning = [c for c in chunks if c["page_end"] > c["page_number"]]
    assert spanning, "expected at least one chunk spanning multiple pages"
    for chunk in chunks:
        assert chunk["page_number"] is not None
        assert chunk["page_end"] >= chunk["page_number"]
    assert any(c["page_number"] == 1 and c["page_end"] == 3 for c in spanning)


def test_pdf_page_span_within_single_page(client: TestClient) -> None:
    headers = guest_session(client)
    # One oversized section (over the 1000-char chunk cap) that must split;
    # every split piece stays on its page. Small font so the whole section
    # fits in the PDF textbox (PyMuPDF inserts nothing on overflow).
    long_section = " ".join(f"Sentence {n} about approved claims." for n in range(1, 60))
    doc = pymupdf.open()
    page = doc.new_page()
    assert page.insert_textbox(page.rect + (50, 50, -50, -50), long_section, fontsize=8) >= 0
    page2 = doc.new_page()
    assert page2.insert_textbox(page2.rect + (50, 50, -50, -50), "Closing note.", fontsize=8) >= 0
    pdf_bytes = doc.tobytes()
    doc.close()
    payload = upload_bytes(
        client, headers, pdf_bytes, filename="split.pdf", title="Split pdf"
    ).json()
    chunks = client.get(
        f"/api/v1/knowledge/documents/{payload['document']['id']}/chunks", headers=headers
    ).json()["chunks"]
    assert len(chunks) > 2
    for chunk in chunks:
        assert chunk["page_end"] >= chunk["page_number"]
    # The oversized page-1 section splits into pieces; the first stays on page 1.
    assert chunks[0]["page_number"] == 1 and chunks[0]["page_end"] == 1
    assert "Sentence 1 " in chunks[0]["text"]


def test_page_spans_preserve_section_ref_scheme(client: TestClient) -> None:
    headers = guest_session(client)
    pdf_bytes = make_pdf(["First section.", "Second section.", "Third section."])
    payload = upload_bytes(client, headers, pdf_bytes, filename="refs.pdf", title="Refs pdf").json()
    chunks = client.get(
        f"/api/v1/knowledge/documents/{payload['document']['id']}/chunks", headers=headers
    ).json()["chunks"]
    assert [c["section_ref"] for c in chunks] == [f"s{i}" for i in range(1, len(chunks) + 1)]


def test_search_results_include_page_span(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_bytes(
        client,
        headers,
        make_pdf(["Unique toneword lives on the first page."]),
        filename="found.pdf",
        title="Findable pdf",
    ).json()
    document_id = payload["document"]["id"]
    assert (
        client.post(
            f"/api/v1/knowledge/documents/{document_id}/approve", headers=headers
        ).status_code
        == 200
    )
    results = client.get("/api/v1/knowledge/search", params={"q": "toneword"}).json()["results"]
    assert len(results) == 1
    assert results[0]["page_number"] == 1
    assert results[0]["page_end"] == 1


def test_plain_text_chunks_have_no_page_span(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_text(client, headers, title="Plain Doc")
    chunks = client.get(
        f"/api/v1/knowledge/documents/{payload['document']['id']}/chunks", headers=headers
    ).json()["chunks"]
    assert all(c["page_number"] is None and c["page_end"] is None for c in chunks)
