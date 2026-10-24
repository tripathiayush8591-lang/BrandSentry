"""Phase 3A FTS5 retrieval tests: relevance, safety, scoping, index updates.

Coverage class: LIVE_BACKEND (real SQLite FTS5 index). Keyword retrieval is
lexical — paraphrases with no shared vocabulary honestly return no results
(no semantic claim is made or tested).
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.helpers_3a import (
    guest_session,
    knowledge_settings,
    make_client,
    upload_and_approve,
    upload_text,
)


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    yield from make_client(knowledge_settings(tmp_path))


def test_exact_term_search_returns_relevant_chunks(client: TestClient) -> None:
    headers = guest_session(client)
    upload_and_approve(client, headers)
    response = client.get("/api/v1/knowledge/search", params={"q": "guaranteed outcomes"})
    assert response.status_code == 200
    body = response.json()
    assert body["retrieval_method"] == "fts5_bm25"
    assert len(body["results"]) >= 1
    top = body["results"][0]
    assert "guaranteed outcomes" in top["text"]
    for key in ("chunk_id", "document_id", "document_title", "version", "section_ref", "score"):
        assert key in top
    assert top["score"] >= 0  # negated bm25 rank; higher = more relevant


def test_pdf_page_metadata_preserved_in_results(tmp_path: Path) -> None:
    from app.main import create_app
    from tests.helpers_3a import make_pdf

    settings = knowledge_settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        headers = guest_session(client)
        pdf = make_pdf(
            [
                "Page one: always include the sustainability footer.",
                "Page two: never photograph the prototype devices.",
            ]
        )
        response = client.post(
            "/api/v1/knowledge/documents",
            files={"file": ("visual.pdf", pdf, "application/pdf")},
            data={"title": "Visual rules", "doc_type": "guidelines"},
            headers=headers,
        )
        document_id = response.json()["document"]["id"]
        client.post(f"/api/v1/knowledge/documents/{document_id}/approve", headers=headers)
        results = client.get("/api/v1/knowledge/search", params={"q": "prototype devices"}).json()[
            "results"
        ]
        assert len(results) == 1
        # Hardening pass: the two short pages merge into one chunk, which
        # reports its true span (pages 1-2) instead of a start page only.
        assert results[0]["page_number"] == 1
        assert results[0]["page_end"] == 2


def test_no_match_query_returns_empty_gracefully(client: TestClient) -> None:
    headers = guest_session(client)
    upload_and_approve(client, headers)
    response = client.get("/api/v1/knowledge/search", params={"q": "quantum wigwam flotilla"})
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_empty_and_special_character_queries_are_safe(client: TestClient) -> None:
    headers = guest_session(client)
    upload_and_approve(client, headers)
    for query in (
        'guarantees "100%" (results!)',
        "guarantee* AND (outcomes OR NOT)",
        "NEAR eco blend",
        "100% results!!! ???",
        "-hyphen-start",
        "'quoted phrase'",
        "a" * 500,
    ):
        response = client.get("/api/v1/knowledge/search", params={"q": query})
        assert response.status_code == 200, f"query {query!r} must not error"


def test_boolean_keyword_alone_does_not_error(client: TestClient) -> None:
    headers = guest_session(client)
    upload_and_approve(client, headers)
    response = client.get("/api/v1/knowledge/search", params={"q": "AND OR NOT NEAR"})
    assert response.status_code == 200  # reserved words filtered, not passed to FTS
    assert response.json()["results"] == []


def test_unapproved_and_pending_knowledge_excluded(client: TestClient) -> None:
    headers = guest_session(client)
    upload_text(client, headers)  # stays pending
    assert (
        client.get("/api/v1/knowledge/search", params={"q": "guaranteed"}).json()["results"] == []
    )

    upload_and_approve(
        client, headers, title="Approved Rules", content="Approved guidance about recycling logos."
    )
    assert client.get("/api/v1/knowledge/search", params={"q": "recycling"}).json()["results"]
    assert (
        client.get("/api/v1/knowledge/search", params={"q": "guaranteed"}).json()["results"] == []
    )


def test_deleted_document_excluded_from_search(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_and_approve(client, headers)
    document_id = payload["document"]["id"]
    assert client.get("/api/v1/knowledge/search", params={"q": "guaranteed"}).json()["results"]

    delete = client.delete(f"/api/v1/knowledge/documents/{document_id}", headers=headers)
    assert delete.status_code == 204
    assert (
        client.get("/api/v1/knowledge/search", params={"q": "guaranteed"}).json()["results"] == []
    )


def test_top_k_is_bounded_and_configurable(tmp_path: Path) -> None:
    settings = knowledge_settings(tmp_path, knowledge_search_max_top_k=2)
    from app.main import create_app

    with TestClient(create_app(settings)) as client:
        headers = guest_session(client)
        # Many approved documents each containing the shared keyword.
        for index in range(5):
            upload_and_approve(
                client,
                headers,
                title=f"Doc {index}",
                content=f"Compliance note {index}: always mention the flagship product.",
                doc_type="source_document",
            )
        results = client.get(
            "/api/v1/knowledge/search", params={"q": "flagship product", "top_k": 10}
        ).json()["results"]
        assert len(results) == 2  # clamped to knowledge_search_max_top_k


def test_paraphrase_without_shared_vocabulary_honestly_empty(client: TestClient) -> None:
    headers = guest_session(client)
    upload_and_approve(
        client, headers, content="Do not promise guaranteed outcomes in marketing copy."
    )
    # Synonyms only — lexical retrieval does not claim semantic understanding.
    response = client.get("/api/v1/knowledge/search", params={"q": "assurances of success"})
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_search_results_carry_version_and_source_for_evidence(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_and_approve(client, headers, title="Brand Guidelines")
    results = client.get("/api/v1/knowledge/search", params={"q": "EcoBlend"}).json()["results"]
    assert results
    top = results[0]
    assert top["document_id"] == payload["document"]["id"]
    assert top["document_title"] == "Brand Guidelines"
    assert top["version"] == 1
    assert top["section_ref"]
    # Source text is preserved so later AI findings can be checked against it.
    assert "EcoBlend" in top["text"]
